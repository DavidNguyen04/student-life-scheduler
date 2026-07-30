// pdfjs-dist optionally requires "@napi-rs/canvas" to polyfill DOMMatrix/ImageData/Path2D
// and to render pages to bitmaps. We only use pdf-parse for text extraction, and the
// real "@napi-rs/canvas" native binding fails to resolve under Turbopack's dev bundler
// (it tries to bundle the platform-specific .node binary instead of using Node's native
// require). pdfjs-dist already wraps its canvas require in a try/catch and degrades
// gracefully when it's unavailable, so we alias it to this stub to skip the native
// binding entirely.
throw new Error("@napi-rs/canvas is stubbed out; not needed for text extraction");
