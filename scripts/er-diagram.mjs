// Builds docs/diagrams/er-diagram.mmd from prisma/schema.prisma, so the ER diagram can't
// drift from the real tables. Run with: npm run docs:diagrams
// `--check` fails if the saved diagram is out of date, which is what CI's unit test uses.
import { readFileSync, writeFileSync } from "node:fs";

const OUTPUT = "docs/diagrams/er-diagram.mmd";

/** Each model's table name, columns and the relations it holds the foreign key for. */
export function parseSchema(schema) {
  const enums = new Set([...schema.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]));
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({
    name: m[1],
    body: m[2],
  }));
  const modelNames = new Set(models.map((m) => m.name));

  return models.map(({ name, body }) => {
    const lines = body.split("\n").map((l) => l.trim());
    const table = body.match(/@@map\("(\w+)"\)/)?.[1] ?? name;
    const columns = [];
    const relations = [];

    for (const line of lines) {
      const field = line.match(/^(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$/);
      if (!field || line.startsWith("@@") || line.startsWith("//")) continue;
      const [, fieldName, type, modifier, attributes] = field;

      if (modelNames.has(type)) {
        const keys = attributes.match(/fields:\s*\[(\w+)\]/)?.[1];
        if (keys) relations.push({ target: type, field: keys, optional: modifier === "?" });
        continue;
      }
      const isEnum = enums.has(type);
      const key = attributes.includes("@id")
        ? "PK"
        : attributes.includes("@unique")
          ? "UK"
          : undefined;
      columns.push({
        name: attributes.match(/@map\("(\w+)"\)/)?.[1] ?? fieldName,
        fieldName,
        type: isEnum ? "enum" : type.toLowerCase(),
        key,
      });
    }

    const foreignKeys = new Set(relations.map((r) => r.field));
    for (const column of columns) {
      if (foreignKeys.has(column.fieldName)) column.key = column.key ? `${column.key}, FK` : "FK";
    }
    // Composite primary keys: event_coordinators (event, user), team_members (team, user).
    const compositeId = body.match(/@@id\(\[([\w, ]+)\]\)/)?.[1].split(", ");
    for (const column of columns) {
      if (compositeId?.includes(column.fieldName)) column.key = "PK, FK";
    }
    return { name, table, columns, relations };
  });
}

export function toMermaid(models) {
  const byName = new Map(models.map((m) => [m.name, m.table]));
  const lines = ["erDiagram"];
  for (const model of models) {
    for (const relation of model.relations) {
      const parentSide = relation.optional ? "|o" : "||";
      lines.push(
        `  ${byName.get(relation.target)} ${parentSide}--o{ ${model.table} : "${relation.field}"`,
      );
    }
  }
  for (const model of models) {
    lines.push(`  ${model.table} {`);
    for (const column of model.columns) {
      lines.push(`    ${column.type} ${column.name}${column.key ? ` ${column.key}` : ""}`);
    }
    lines.push("  }");
  }
  return `${lines.join("\n")}\n`;
}

export function erDiagram() {
  return toMermaid(parseSchema(readFileSync("prisma/schema.prisma", "utf8")));
}

if (process.argv[1]?.endsWith("er-diagram.mjs")) {
  writeFileSync(OUTPUT, erDiagram());
  console.log(`Wrote ${OUTPUT}`);
}
