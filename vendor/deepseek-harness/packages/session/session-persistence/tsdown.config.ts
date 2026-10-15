import { defineConfig } from 'tsdown'

// The shared metadata leaf must exist at the public export after materializing.
export default defineConfig({ entry: ['lib/types/{index,recovery}.js'] })
