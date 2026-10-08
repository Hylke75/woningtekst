"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, Italic, List, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function useRichEditor(initialHtml: string, onChange: (html: string) => void, editable: boolean, onReady?: (normalizedHtml: string) => void) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
        underline: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
      }),
    ],
    content: initialHtml,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-editor min-h-[320px] px-5 py-4 sm:px-6",
        "aria-label": "Tekst bewerken",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onCreate: ({ editor }) => onReady?.(editor.getHTML()),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);
  return editor;
}

export function EditorToolbar({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  if (!editor) return <div className="h-10 border-b" />;
  const btn = (label: string, active: boolean, onClick: () => void, icon: React.ReactNode) => (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && "bg-accent text-primary")}
    >
      {icon}
    </Button>
  );
  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1" role="toolbar" aria-label="Opmaak">
      {btn("Vet", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold />)}
      {btn("Cursief", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic />)}
      {btn("Kop", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 />)}
      {btn("Subkop", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 />)}
      {btn("Opsomming", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List />)}
      <span className="mx-1 h-5 w-px bg-border" />
      {btn("Ongedaan maken", false, () => editor.chain().focus().undo().run(), <Undo2 />)}
      {btn("Opnieuw", false, () => editor.chain().focus().redo().run(), <Redo2 />)}
    </div>
  );
}

export function RichEditorContent({ editor }: { editor: Editor | null }) {
  return <EditorContent editor={editor} />;
}
