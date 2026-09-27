export function TagList({
  tags,
  labels,
}: {
  tags: { key: string; strength: number }[];
  labels: Map<string, string>;
}) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag.key} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {labels.get(tag.key) ?? tag.key}
        </li>
      ))}
    </ul>
  );
}
