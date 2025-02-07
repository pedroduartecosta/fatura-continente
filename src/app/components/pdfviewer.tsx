import React, { useEffect, useRef } from "react";

// First, declare the module for pdf.js
declare module "../../../public/pdf.mjs" {
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    destroy(): Promise<void>;
  }

  export interface PDFPageProxy {
    getViewport(options: { scale: number }): PDFPageViewport;
    render(options: RenderParameters): RenderTask;
    cleanup(): void;
  }

  export interface PDFPageViewport {
    width: number;
    height: number;
    scale: number;
  }

  export interface RenderParameters {
    canvasContext: CanvasRenderingContext2D;
    viewport: PDFPageViewport;
  }

  export interface RenderTask {
    promise: Promise<void>;
    cancel(): void;
  }

  export interface GlobalWorkerOptions {
    workerSrc: string;
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
    destroy(): void;
  }
}

import * as pdfjsLib from "../../../public/pdf.mjs";

interface PDFViewerProps {
  file: File | null;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ file }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pageRef = useRef<pdfjsLib.PDFPageProxy | null>(null);
  const documentRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const mountedRef = useRef(true);
  const lastFileRef = useRef<File | null>(null);
  const renderTimeoutRef = useRef<number | null>(null);

  const cleanup = async () => {
    try {
      // Clear any pending render timeout
      if (renderTimeoutRef.current !== null) {
        window.clearTimeout(renderTimeoutRef.current);
        renderTimeoutRef.current = null;
      }

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      if (pageRef.current) {
        pageRef.current.cleanup();
        pageRef.current = null;
      }

      if (documentRef.current) {
        await documentRef.current.destroy();
        documentRef.current = null;
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  };

  const renderPage = async (
    canvas: HTMLCanvasElement,
    page: pdfjsLib.PDFPageProxy
  ) => {
    if (!mountedRef.current) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    try {
      // Cancel any existing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      // Clear any existing timeout
      if (renderTimeoutRef.current !== null) {
        window.clearTimeout(renderTimeoutRef.current);
        renderTimeoutRef.current = null;
      }

      // Create a new render task
      const renderTask = page.render({
        canvasContext: context,
        viewport: viewport,
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
    } catch (error) {
      if (error instanceof Error && error.message !== "Rendering cancelled") {
        console.error("Render error:", error);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

    return () => {
      mountedRef.current = false;
      if (renderTimeoutRef.current !== null) {
        window.clearTimeout(renderTimeoutRef.current);
        renderTimeoutRef.current = null;
      }
      cleanup();
    };
  }, []);

  useEffect(() => {
    const loadPDF = async () => {
      // Skip if no file or same file
      if (!file || file === lastFileRef.current) return;
      lastFileRef.current = file;

      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        await cleanup();
        if (!mountedRef.current) return;

        const arrayBuffer = await file.arrayBuffer();
        if (!mountedRef.current) return;

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (!mountedRef.current) {
          pdf.destroy();
          return;
        }
        documentRef.current = pdf;

        const page = await pdf.getPage(1);
        if (!mountedRef.current) {
          page.cleanup();
          pdf.destroy();
          return;
        }
        pageRef.current = page;

        // Render with a small delay to prevent flickering
        renderTimeoutRef.current = window.setTimeout(() => {
          renderPage(canvas, page);
        }, 100);
      } catch (error) {
        console.error("Error loading PDF:", error);
        await cleanup();
      }
    };

    loadPDF();
  }, [file]);

  return (
    <div className="w-full overflow-auto bg-white rounded-lg shadow">
      <canvas
        ref={canvasRef}
        className="mx-auto"
        aria-label="PDF Viewer"
        role="img"
      />
    </div>
  );
};

export default PDFViewer;
