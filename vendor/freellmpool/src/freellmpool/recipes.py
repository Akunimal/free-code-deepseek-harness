"""Bundled recipe workflows for practical freellmpool tasks."""

from __future__ import annotations

import glob
import json
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from string import Template
from typing import Any

from .panel import render_panel_markdown, run_panel
from .roles import RoleSpec, get_role
from .router import Pool

RECIPE_SCHEMA_VERSION = "1.0.0"


class RecipeError(ValueError):
    """Base class for actionable recipe errors."""


class UnknownRecipeError(RecipeError):
    def __init__(self, name: str):
        super().__init__(f"unknown recipe '{name}'")
        self.name = name


class MissingRecipeInputError(RecipeError):
    pass


class MissingRecipeVariableError(RecipeError):
    def __init__(self, names: list[str]):
        super().__init__(f"missing recipe variable(s): {', '.join(names)}")
        self.names = tuple(names)


@dataclass(frozen=True)
class Recipe:
    name: str
    version: str
    description: str
    role: str
    prompt_template: str
    variables: tuple[str, ...]
    input_mode: str
    output_mode: str
    example: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Recipe:
        if data.get("schema_version") != RECIPE_SCHEMA_VERSION:
            raise RecipeError(f"unsupported recipe schema version for {data.get('name', '?')}")
        required = (
            "name",
            "version",
            "description",
            "role",
            "prompt_template",
            "variables",
            "input_mode",
            "output_mode",
            "example",
        )
        missing = [key for key in required if key not in data]
        if missing:
            raise RecipeError(f"recipe {data.get('name', '?')} missing field(s): {', '.join(missing)}")
        variables = data["variables"]
        if not isinstance(variables, list) or not all(isinstance(v, str) for v in variables):
            raise RecipeError(f"recipe {data['name']} has invalid variables")
        return cls(
            name=str(data["name"]),
            version=str(data["version"]),
            description=str(data["description"]),
            role=str(data["role"]),
            prompt_template=str(data["prompt_template"]),
            variables=tuple(variables),
            input_mode=str(data["input_mode"]),
            output_mode=str(data["output_mode"]),
            example=str(data["example"]),
        )

    def summary(self) -> dict[str, str]:
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "role": self.role,
            "input_mode": self.input_mode,
            "output_mode": self.output_mode,
            "example": self.example,
        }


@dataclass(frozen=True)
class RecipeRun:
    recipe: Recipe
    output: str
    provider_id: str | None = None
    model: str | None = None
    prompt: str = ""


def list_recipes() -> list[Recipe]:
    recipes = [_load_recipe(path) for path in _recipe_paths()]
    return sorted(recipes, key=lambda recipe: recipe.name)


def list_recipes_json() -> dict[str, Any]:
    return {
        "schema_version": RECIPE_SCHEMA_VERSION,
        "recipes": [recipe.summary() for recipe in list_recipes()],
    }


def get_recipe(name: str) -> Recipe:
    for recipe in list_recipes():
        if recipe.name == name:
            return recipe
    raise UnknownRecipeError(name)


def render_recipe(recipe: Recipe) -> str:
    return "\n".join(
        [
            f"{recipe.name} ({recipe.version})",
            recipe.description,
            f"role: {recipe.role}",
            f"input: {recipe.input_mode}",
            f"output: {recipe.output_mode}",
            f"example: {recipe.example}",
        ]
    )


def collect_recipe_input(
    recipe: Recipe,
    *,
    prompt: str = "",
    stdin: str = "",
    input_file: str | None = None,
    path: str | None = None,
) -> tuple[str, str | None]:
    if recipe.input_mode == "path":
        if not path:
            raise MissingRecipeInputError(
                f"recipe '{recipe.name}' requires --path <glob>; prompt/stdin/--input are not enough"
            )
        return _path_payload(path), path

    if input_file:
        return Path(input_file).read_text(encoding="utf-8"), None
    if stdin.strip():
        return stdin, None
    if prompt.strip():
        return prompt, None
    raise MissingRecipeInputError(
        f"recipe '{recipe.name}' requires prompt text, stdin, --input <file>, or --path <glob>"
    )


def render_prompt(recipe: Recipe, variables: dict[str, str]) -> str:
    missing = [name for name in recipe.variables if not variables.get(name)]
    if missing:
        raise MissingRecipeVariableError(missing)
    try:
        return Template(recipe.prompt_template).substitute(variables)
    except KeyError as exc:
        raise MissingRecipeVariableError([str(exc).strip("'")]) from exc


def run_recipe(
    pool: Pool,
    recipe: Recipe,
    *,
    input_text: str,
    path: str | None = None,
    validation_output: str | None = None,
    opinions: int = 3,
    synthesize: bool = False,
    max_tokens: int | None = None,
    timeout: float = 90.0,
) -> RecipeRun:
    variables = {
        "input": input_text,
        "path": path or "",
        "validation_output": validation_output or "",
    }
    prompt = render_prompt(recipe, variables)
    role = get_role(recipe.role)

    if recipe.output_mode == "panel":
        result = run_panel(
            pool,
            prompt=prompt,
            n=opinions,
            system=role.system_prefix if role is not None else None,
            routing=role.routing if role is not None else "quality",
            max_tokens=max_tokens if max_tokens is not None else 512,
            timeout=timeout,
            synthesize=synthesize,
        )
        return RecipeRun(recipe=recipe, output=render_panel_markdown(result), prompt=prompt)

    reply = pool.ask(
        prompt,
        system=role.system_prefix if role is not None else None,
        max_tokens=max_tokens if max_tokens is not None else _role_max_tokens(role),
        temperature=role.temperature if role and role.temperature is not None else 0.0,
        routing=role.routing if role is not None else None,
        timeout=timeout,
    )
    return RecipeRun(
        recipe=recipe,
        output=reply.text,
        provider_id=reply.provider_id,
        model=reply.model,
        prompt=prompt,
    )


def write_recipe_record(run: RecipeRun, *, store=None):
    from .artifacts import RunRecordStore

    store = store or RunRecordStore()
    return store.append_new(
        kind="recipe",
        title=f"freellmpool recipe {run.recipe.name}",
        prompt=run.prompt,
        output=run.output,
        provider_id=run.provider_id,
        model=run.model,
        recipe=run.recipe.name,
        role=run.recipe.role,
        metadata={
            "recipe_version": run.recipe.version,
            "input_mode": run.recipe.input_mode,
            "output_mode": run.recipe.output_mode,
        },
    )


def _recipe_paths() -> list[Any]:
    return sorted(
        (
            path
            for path in resources.files("freellmpool").joinpath("recipes").iterdir()
            if path.name.endswith(".json")
        ),
        key=lambda path: path.name,
    )


def _load_recipe(path: Any) -> Recipe:
    with path.open("r", encoding="utf-8") as fh:
        return Recipe.from_dict(json.load(fh))


def _path_payload(pattern: str) -> str:
    matches = [Path(p) for p in sorted(glob.glob(pattern, recursive=True))]
    if not matches:
        raise MissingRecipeInputError(f"--path matched no files: {pattern}")
    parts: list[str] = []
    for path in matches:
        if path.is_dir():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = "<binary file skipped>"
        except OSError as exc:
            text = f"<could not read: {exc}>"
        parts.append(f"--- {path} ---\n{text}")
    if not parts:
        raise MissingRecipeInputError(f"--path matched no readable files: {pattern}")
    return "\n\n".join(parts)


def _role_max_tokens(role: RoleSpec | None) -> int:
    return role.max_tokens if role is not None and role.max_tokens is not None else 1024
