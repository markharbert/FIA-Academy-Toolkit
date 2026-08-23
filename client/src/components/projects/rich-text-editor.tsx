import { useEditor, EditorContent } from "@tiptap/react";
import { mergeAttributes, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Code, Link2, Undo2, Redo2, Heading2, Image as ImageIcon, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

const LessonImage = Node.create({
  name: "lessonImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "img[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, {
      class: "my-4 max-w-full rounded-md",
    })];
  },
});

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  testId?: string;
}

export function RichTextEditor({ value, onChange, placeholder, testId }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      LessonImage,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "text-primary underline underline-offset-2", rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[140px] px-3 py-2 focus:outline-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_h2]:mt-2 [&_h2]:mb-1",
        "data-testid": testId ? `${testId}-content` : "editor-content",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Keep editor content in sync if value changes externally (e.g. opening a different task)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    const normCurrent = current === "<p></p>" ? "" : current;
    if (normCurrent !== incoming) {
      editor.commands.setContent(incoming || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
      editor.chain().focus().extendMarkRange("link").setLink({ href: parsed.toString() }).run();
    } catch {
      // ignore invalid url
    }
  };

  const insertImageUrl = () => {
    const url = window.prompt("Image URL", "https://");
    if (url === null) return;
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
      editor.chain().focus().insertContent({
        type: "lessonImage",
        attrs: { src: parsed.toString(), alt: "" },
      }).run();
      setImageError("");
    } catch {
      setImageError("Please enter a valid http(s) image URL.");
    }
  };

  const uploadImage = async (file: File) => {
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageError("Images must be 10 MB or smaller.");
      return;
    }

    setIsUploadingImage(true);
    try {
      const response = await apiRequest("POST", "/api/admin/lesson-images/request-upload-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadUrl, imageUrl } = await response.json();
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadResponse.ok) throw new Error("Upload failed");
      editor.chain().focus().insertContent({
        type: "lessonImage",
        attrs: { src: imageUrl, alt: file.name },
      }).run();
    } catch {
      setImageError("Image upload failed. Please try again.");
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const Btn = ({ active, onClick, label, icon: Icon, tid }: { active?: boolean; onClick: () => void; label: string; icon: React.ComponentType<{ className?: string }>; tid: string }) => (
    <Button
      type="button"
      size="icon"
      variant={active ? "secondary" : "ghost"}
      className="h-7 w-7"
      onClick={onClick}
      title={label}
      aria-label={label}
      data-testid={tid}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );

  return (
    <div className="rounded-md border border-input bg-background overflow-hidden" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-1.5 py-1">
        <Btn tid="editor-bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold" icon={Bold} />
        <Btn tid="editor-italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic" icon={Italic} />
        <Btn tid="editor-strike" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} label="Strikethrough" icon={Strikethrough} />
        <div className="mx-1 h-4 w-px bg-border" />
        <Btn tid="editor-h2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Heading" icon={Heading2} />
        <Btn tid="editor-bullets" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bullets" icon={List} />
        <Btn tid="editor-ordered" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Numbered" icon={ListOrdered} />
        <Btn tid="editor-quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="Quote" icon={Quote} />
        <Btn tid="editor-code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} label="Code" icon={Code} />
        <Btn tid="editor-link" active={editor.isActive("link")} onClick={setLink} label="Link" icon={Link2} />
        <Btn tid="editor-image-url" onClick={insertImageUrl} label="Insert image from URL" icon={ImageIcon} />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadImage(file);
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => imageInputRef.current?.click()}
          disabled={isUploadingImage}
          title="Upload image"
          aria-label="Upload image"
          data-testid="editor-image-upload"
        >
          {isUploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Btn tid="editor-undo" onClick={() => editor.chain().focus().undo().run()} label="Undo" icon={Undo2} />
        <Btn tid="editor-redo" onClick={() => editor.chain().focus().redo().run()} label="Redo" icon={Redo2} />
      </div>
      {imageError && <p className="px-3 py-1 text-xs text-destructive">{imageError}</p>}
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}
