// @vitest-environment jsdom

import assert from "node:assert/strict";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, test, vi } from "vitest";
import AdminLessonEditorPage from "./admin-lesson-editor";

vi.mock("wouter", () => ({
  useParams: () => ({ id: "course-1", lessonId: "lesson-1" }),
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/projects/rich-text-editor", () => ({
  RichTextEditor: ({
    value,
    onChange,
    testId,
  }: {
    value: string;
    onChange: (value: string) => void;
    testId?: string;
  }) => (
    <textarea
      data-testid={testId ?? "editor-content"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

const lesson = {
  id: "lesson-1",
  courseId: "course-1",
  moduleId: "module-1",
  title: "Original lesson",
  videoUrl: null,
  content: "<p>Original content</p>",
  status: "draft",
  durationMinutes: null,
  resources: [],
};

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Admin lesson editor autosave", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("keeps newer typing visible and persists it after a slow save and resource refetch", async () => {
    const firstSave = deferred<Response>();
    const savedPayloads: Array<{ content: string }> = [];
    let lessonFetches = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";

        if (method === "GET") {
          lessonFetches += 1;
          return Promise.resolve(response(lesson));
        }

        if (method === "PUT") {
          const payload = JSON.parse(String(init?.body)) as { content: string };
          savedPayloads.push(payload);
          if (savedPayloads.length === 1) return firstSave.promise;
          return Promise.resolve(response({ ...lesson, content: payload.content }));
        }

        if (method === "POST") {
          return Promise.resolve(response({ id: "resource-1" }));
        }

        throw new Error(`Unexpected request: ${method} ${url}`);
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AdminLessonEditorPage />
      </QueryClientProvider>,
    );

    const titleInput = await screen.findByDisplayValue("Original lesson");
    const editor = await screen.findByTestId("editor-content");

    fireEvent.change(titleInput, { target: { value: "First draft" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => assert.equal(savedPayloads.length, 1));

    fireEvent.change(editor, { target: { value: "<p>Newer content</p>" } });
    await new Promise((resolve) => setTimeout(resolve, 2050));

    fireEvent.click(screen.getByRole("button", { name: /Add Resource/ }));
    fireEvent.change(screen.getByPlaceholderText("Worksheet PDF"), {
      target: { value: "Workbook" },
    });
    fireEvent.change(screen.getByPlaceholderText("https://…"), {
      target: { value: "https://example.com/workbook" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => assert.equal(lessonFetches, 2));
    assert.equal((editor as HTMLTextAreaElement).value, "<p>Newer content</p>");

    firstSave.resolve(response({ ...lesson, title: "First draft" }));
    await waitFor(() => assert.equal(savedPayloads.length, 2));
    assert.equal(savedPayloads[1]?.content, "<p>Newer content</p>");

    await waitFor(() => assert.equal((editor as HTMLTextAreaElement).value, "<p>Newer content</p>"));
  });
});