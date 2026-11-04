"use client";

import { useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  Heading2Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * A small rich-text box. The HTML travels in a hidden input, so it posts with
 * the form like any other field. The server cleans it again before saving; the
 * buttons here are a convenience, not a safety measure.
 */
export function RichTextEditor({
  id,
  name,
  defaultValue,
  label,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  defaultValue: string;
  label: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [html, setHtml] = useState(defaultValue);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
      }),
    ],
    content: defaultValue,
    // The page is rendered on the server first; wait for the browser.
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => setHtml(editor.isEmpty ? "" : editor.getHTML()),
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(invalid ? { "aria-invalid": "true" } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        class: "rich-text min-h-40 px-2.5 py-2 outline-none",
      },
    },
  });

  return (
    <div
      className={cn(
        "rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive ring-3 ring-destructive/20",
      )}
    >
      <input type="hidden" name={name} value={html} />
      <Toolbar editor={editor} />
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        // Holds the height until the editor starts, so the form doesn't jump.
        <div className="min-h-40" aria-hidden />
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  function setLink() {
    if (!editor) return;
    const current = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      "Link address (leave empty to remove the link)",
      current ?? "https://",
    );
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url.trim() === "" || url.trim() === "https://") chain.unsetLink().run();
    else chain.setLink({ href: url.trim() }).run();
  }

  const tools: { label: string; icon: LucideIcon; active?: boolean; run: () => void }[] = editor
    ? [
        {
          label: "Bold",
          icon: BoldIcon,
          active: editor.isActive("bold"),
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          label: "Italic",
          icon: ItalicIcon,
          active: editor.isActive("italic"),
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          label: "Heading",
          icon: Heading2Icon,
          active: editor.isActive("heading", { level: 2 }),
          run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
          label: "Bullet list",
          icon: ListIcon,
          active: editor.isActive("bulletList"),
          run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          label: "Numbered list",
          icon: ListOrderedIcon,
          active: editor.isActive("orderedList"),
          run: () => editor.chain().focus().toggleOrderedList().run(),
        },
        {
          label: "Quote",
          icon: QuoteIcon,
          active: editor.isActive("blockquote"),
          run: () => editor.chain().focus().toggleBlockquote().run(),
        },
        { label: "Link", icon: LinkIcon, active: editor.isActive("link"), run: setLink },
      ]
    : [];

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex min-h-9 flex-wrap gap-0.5 border-b p-1"
    >
      {tools.map((t) => (
        <Button
          key={t.label}
          type="button"
          variant={t.active ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={t.label}
          aria-pressed={t.active}
          title={t.label}
          onClick={t.run}
        >
          <t.icon aria-hidden />
        </Button>
      ))}
    </div>
  );
}
