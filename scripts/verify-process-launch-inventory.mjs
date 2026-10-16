import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROCESS_APIS = new Set(['exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'spawn', 'spawnSync'])
const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])
const SKIP_DIRS = new Set(['.git', 'coverage', 'dist', 'fixtures', 'fixture', 'graphify-out', 'lib', 'node_modules', 'test', 'tests', '__tests__'])
const CHILD_PROCESS_MODULES = new Set(['child_process', 'node:child_process'])

// These wrappers launch only user-requested GUI handlers. Their non-hidden
// behavior is explicit and scoped; all other launch sites must hide windows.
const VISIBLE_UI_EXCEPTIONS = new Map([
  ['vendor/deepseek-harness/packages/host/open-in-app/src/resolver.ts', {
    api: 'spawn',
    expression: 'options.windowsHide??true',
    reason: 'Opens a user-selected desktop app; console hiding defaults to true.',
  }],
  ['vendor/deepseek-harness/packages/util/native-command/src/runner.ts', {
    api: 'execFile',
    expression: "window==='hidden'",
    reason: 'Explicit visible-window requests are limited to native GUI applications.',
  }],
])

function normalizedPath(path) {
  return path.replaceAll('\\', '/')
}

function unwrap(expression) {
  let current = expression
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isAwaitExpression(current)
  ) current = current.expression
  return current
}

function moduleSpecifierFromCall(expression) {
  const value = unwrap(expression)
  if (!ts.isCallExpression(value) || value.arguments.length === 0) return undefined
  const first = value.arguments[0]
  if (!ts.isStringLiteralLike(first) || !CHILD_PROCESS_MODULES.has(first.text)) return undefined
  const callee = unwrap(value.expression)
  if ((ts.isIdentifier(callee) && callee.text === 'require') || callee.kind === ts.SyntaxKind.ImportKeyword) return first.text
  return undefined
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function apiForMember(expression, namespaces, moduleExpression) {
  const member = unwrap(expression)
  if (ts.isPropertyAccessExpression(member)) {
    const name = member.name.text
    if (!PROCESS_APIS.has(name)) return undefined
    const owner = unwrap(member.expression)
    if (ts.isIdentifier(owner) && namespaces.has(owner.text)) return name
    if (moduleExpression(owner)) return name
  }
  if (ts.isElementAccessExpression(member) && member.argumentExpression !== undefined) {
    const name = propertyName(unwrap(member.argumentExpression))
    if (name === undefined || !PROCESS_APIS.has(name)) return undefined
    const owner = unwrap(member.expression)
    if (ts.isIdentifier(owner) && namespaces.has(owner.text)) return name
    if (moduleExpression(owner)) return name
  }
  return undefined
}

function parseLaunches(source, file) {
  const extension = extname(file).toLowerCase()
  const kind = extension === '.tsx' || extension === '.jsx'
    ? ts.ScriptKind.TSX
    : extension === '.js' || extension === '.mjs' || extension === '.cjs'
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const apiBindings = new Map()
  const namespaces = new Set()
  const variableDeclarations = []

  const bindNamedImports = (bindings) => {
    if (!ts.isNamedImports(bindings)) return
    for (const element of bindings.elements) {
      const api = element.propertyName?.text ?? element.name.text
      if (PROCESS_APIS.has(api)) apiBindings.set(element.name.text, api)
    }
  }

  const isChildProcessModuleExpression = (expression) => moduleSpecifierFromCall(expression) !== undefined

  function bindDestructuring(binding, initializer) {
    if (!ts.isObjectBindingPattern(binding)) return
    for (const element of binding.elements) {
      if (!ts.isIdentifier(element.name)) continue
      const importedName = propertyName(element.propertyName ?? element.name)
      if (importedName !== undefined && PROCESS_APIS.has(importedName)
        && (isChildProcessModuleExpression(initializer)
          || (ts.isIdentifier(unwrap(initializer)) && namespaces.has(unwrap(initializer).text)))) {
        apiBindings.set(element.name.text, importedName)
      }
    }
  }

  const collectBindings = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)
      && CHILD_PROCESS_MODULES.has(node.moduleSpecifier.text)) {
      const bindings = node.importClause?.namedBindings
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
      else if (bindings !== undefined) bindNamedImports(bindings)
      if (node.importClause?.name !== undefined) namespaces.add(node.importClause.name.text)
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression
      if (expression !== undefined && ts.isStringLiteralLike(expression) && CHILD_PROCESS_MODULES.has(expression.text)) {
        namespaces.add(node.name.text)
      }
    }
    if (ts.isVariableDeclaration(node)) variableDeclarations.push(node)
    ts.forEachChild(node, collectBindings)
  }
  collectBindings(sourceFile)

  const declarationByName = new Map()
  for (const declaration of variableDeclarations) {
    if (ts.isIdentifier(declaration.name)) {
      const previous = declarationByName.get(declaration.name.text) ?? []
      previous.push(declaration)
      declarationByName.set(declaration.name.text, previous)
    }
  }

  function resolveApi(expression) {
    const value = unwrap(expression)
    if (ts.isIdentifier(value)) return apiBindings.get(value.text)
    const member = apiForMember(value, namespaces, isChildProcessModuleExpression)
    if (member !== undefined) return member
    if (ts.isCallExpression(value)) {
      const callee = unwrap(value.expression)
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'bind') {
        return resolveApi(callee.expression)
      }
      if (ts.isIdentifier(callee) && callee.text === 'promisify') {
        return value.arguments.map(resolveApi).find(api => api !== undefined)
      }
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'promisify') {
        return value.arguments.map(resolveApi).find(api => api !== undefined)
      }
    }
    return undefined
  }

  function resolveNamespace(expression) {
    const value = unwrap(expression)
    if (isChildProcessModuleExpression(value)) return true
    return ts.isIdentifier(value) && namespaces.has(value.text)
  }

  // Resolve straightforward aliases and `promisify(execFile)` wrappers before
  // collecting calls; unresolved option flows are intentionally rejected.
  for (let pass = 0; pass <= variableDeclarations.length; pass += 1) {
    let changed = false
    for (const declaration of variableDeclarations) {
      if (declaration.initializer === undefined) continue
      if (ts.isIdentifier(declaration.name)) {
        const name = declaration.name.text
        const api = resolveApi(declaration.initializer)
        if (api !== undefined && apiBindings.get(name) !== api) {
          apiBindings.set(name, api)
          changed = true
        }
        if (resolveNamespace(declaration.initializer) && !namespaces.has(name)) {
          namespaces.add(name)
          changed = true
        }
      } else {
        bindDestructuring(declaration.name, declaration.initializer)
      }
    }
    if (!changed) break
  }

  function normalizeExpression(expression) {
    return expression.getText(sourceFile).replace(/\s+/gu, '')
  }

  function resolveHideValue(expression, seen = new Set()) {
    const value = unwrap(expression)
    if (value.kind === ts.SyntaxKind.TrueKeyword) return { policy: 'hidden', expression: 'true' }
    if (ts.isIdentifier(value)) {
      if (seen.has(value.text)) return { policy: 'unknown', expression: value.text }
      seen.add(value.text)
      const declarations = declarationByName.get(value.text) ?? []
      if (declarations.length === 1 && declarations[0].initializer !== undefined) {
        return resolveHideValue(declarations[0].initializer, seen)
      }
    }
    return { policy: 'dynamic', expression: normalizeExpression(value) }
  }

  function windowsHideFromObject(expression, seen = new Set()) {
    const value = unwrap(expression)
    if (ts.isObjectLiteralExpression(value)) {
      let policy = { policy: 'absent', expression: undefined }
      for (const property of value.properties) {
        if (ts.isPropertyAssignment(property) && propertyName(property.name) === 'windowsHide') {
          policy = resolveHideValue(property.initializer)
        } else if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'windowsHide') {
          policy = resolveHideValue(property.name)
        } else if (ts.isSpreadAssignment(property)) {
          const spreadPolicy = resolveOptionValue(property.expression, seen)
          if (spreadPolicy.policy !== 'absent') policy = spreadPolicy
        }
      }
      return policy
    }
    return resolveOptionValue(value, seen)
  }

  function resolveOptionValue(expression, seen = new Set()) {
    const value = unwrap(expression)
    if (ts.isConditionalExpression(value)) {
      const whenTrue = windowsHideFromObject(value.whenTrue, new Set(seen))
      const whenFalse = windowsHideFromObject(value.whenFalse, new Set(seen))
      if (whenTrue.policy === 'absent' && whenFalse.policy === 'absent') return { policy: 'absent', expression: undefined }
      if (whenTrue.policy === whenFalse.policy && whenTrue.expression === whenFalse.expression) return whenTrue
      return { policy: 'unknown', expression: normalizeExpression(value) }
    }
    if (!ts.isIdentifier(value)) return { policy: 'unknown', expression: normalizeExpression(value) }
    if (seen.has(value.text)) return { policy: 'unknown', expression: value.text }
    seen.add(value.text)
    const declarations = declarationByName.get(value.text) ?? []
    if (declarations.length !== 1 || declarations[0].initializer === undefined) {
      return { policy: 'unknown', expression: value.text }
    }
    return windowsHideFromObject(declarations[0].initializer, seen)
  }

  function optionsArgument(call, api) {
    const args = call.arguments
    let index
    if (api === 'exec' || api === 'execSync') index = 1
    else if (api === 'execFile' || api === 'execFileSync' || api === 'fork') index = args.length >= 3 ? 2 : 1
    else index = args.length >= 3 ? 2 : 1
    const candidate = args[index]
    if (candidate === undefined) return undefined
    if (ts.isArrayLiteralExpression(unwrap(candidate))) return undefined
    if ((api === 'execFile' || api === 'fork') && args.length === 3
      && (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate))) return undefined
    return candidate
  }

  const launches = []
  const collectCalls = (node) => {
    if (ts.isCallExpression(node)) {
      const api = resolveApi(node.expression)
      if (api !== undefined && PROCESS_APIS.has(api)) {
        const options = optionsArgument(node, api)
        let policy = options === undefined ? { policy: 'missing', expression: undefined } : windowsHideFromObject(options)
        if (policy.policy === 'absent') policy = { policy: 'missing', expression: undefined }
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
        const filePath = normalizedPath(file)
        const exception = VISIBLE_UI_EXCEPTIONS.get(filePath)
        if (policy.policy === 'dynamic' && exception?.api === api && policy.expression === exception.expression) {
          policy = { policy: 'visible-ui-exception', expression: policy.expression }
        }
        launches.push({ file: filePath, line, api, policy: policy.policy, ...(policy.expression === undefined ? {} : { expression: policy.expression }) })
      }
    }
    ts.forEachChild(node, collectCalls)
  }
  collectCalls(sourceFile)
  return { launches, parseDiagnostics: sourceFile.parseDiagnostics.map(diagnostic => {
    const position = diagnostic.start ?? 0
    const line = sourceFile.getLineAndCharacterOfPosition(position).line + 1
    return `${normalizedPath(file)}:${line}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
  }) }
}

/** Inspect direct and aliased child_process launch calls in one JS/TS source file. */
export function inspectProcessLaunchSource(source, file = '<source>') {
  return parseLaunches(source, file).launches.map(({ expression: _expression, ...launch }) => launch)
}

function filesUnder(directory) {
  const output = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) output.push(...filesUnder(join(directory, entry.name)))
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      output.push(join(directory, entry.name))
    }
  }
  return output
}

function packageSourceRoots(packagesDirectory) {
  const roots = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
      const child = join(directory, entry.name)
      if (entry.name === 'src') roots.push(child)
      else visit(child)
    }
  }
  visit(packagesDirectory)
  return roots
}

function sourceFiles(root) {
  const appRoots = [
    join(root, 'apps', 'shell', 'src'),
    join(root, 'vendor', 'deepseek-harness', 'apps', 'desktop', 'src'),
  ]
  const vendorPackages = join(root, 'vendor', 'deepseek-harness', 'packages')
  const roots = [...appRoots, ...packageSourceRoots(vendorPackages)]
  return [...new Set(roots.flatMap(filesUnder))].sort()
}

/** Fail closed on unhidden process launch callsites and stale/changed UI exceptions. */
export function verifyProcessLaunchInventory(root = repoRoot) {
  const files = sourceFiles(root)
  const launches = []
  const failures = []
  const exceptionCounts = new Map([...VISIBLE_UI_EXCEPTIONS.keys()].map(path => [path, 0]))

  for (const file of files) {
    const path = normalizedPath(relative(root, file))
    const result = parseLaunches(readFileSync(file, 'utf8'), path)
    failures.push(...result.parseDiagnostics)
    for (const launch of result.launches) {
      launches.push(launch)
      if (path.startsWith('apps/shell/src/') && ![
        'apps/shell/src/main/freecode-launcher.ts', 'apps/shell/src/main/interactive-gui.ts',
      ].includes(path)) {
        failures.push(`${path}:${launch.line}: ${launch.api} bypasses the required native headless host`)
      }
      const exception = VISIBLE_UI_EXCEPTIONS.get(path)
      if (launch.policy === 'visible-ui-exception' && exception?.api === launch.api) {
        exceptionCounts.set(path, (exceptionCounts.get(path) ?? 0) + 1)
        continue
      }
      if (launch.policy !== 'hidden') {
        failures.push(`${path}:${launch.line}: ${launch.api} launch has ${launch.policy === 'missing' ? 'no windowsHide policy' : `unverified windowsHide policy${launch.expression === undefined ? '' : ` (${launch.expression})`}`}`)
      }
    }
  }

  for (const [path, exception] of VISIBLE_UI_EXCEPTIONS) {
    const count = exceptionCounts.get(path) ?? 0
    if (count !== 1) failures.push(`${path}: expected exactly one reviewed visible-UI exception (${exception.api}; ${exception.reason}), found ${count}`)
  }
  return {
    files: files.length,
    launches: launches.length,
    visibleUiExceptions: [...exceptionCounts.values()].reduce((sum, count) => sum + count, 0),
    failures,
    sites: launches,
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = verifyProcessLaunchInventory()
  if (result.failures.length > 0) {
    console.error(`verify-process-launch-inventory: FAIL — ${result.failures.length} issue(s):\n- ${result.failures.join('\n- ')}`)
    process.exitCode = 1
  } else {
    console.log(`verify-process-launch-inventory: PASS — ${result.files} source files, ${result.launches} child-process launch callsites, ${result.visibleUiExceptions} documented GUI exceptions`)
  }
}
