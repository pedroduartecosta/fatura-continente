import * as pdfjsLib from "../../public/pdf.mjs";

export interface ReceiptItem {
  description: string;
  price: number;
}

interface ProcessedReceipt {
  items: ReceiptItem[];
  total: number;
  discount: number;
}

function cleanPrice(priceStr: string): number {
  return parseFloat(priceStr.replace(",", "."));
}

function findSubtotalAndDiscount(text: string): [number, number] {
  const lines = text.split(/\s+/);
  let subtotal = 0;
  let discount = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "SUBTOTAL" && lines[i + 1]?.match(/\d+,\d+/)) {
      subtotal = cleanPrice(lines[i + 1]);
    }
    if (
      lines[i] === "Cartao" &&
      lines[i + 1] === "Utilizado" &&
      lines[i + 2]?.match(/\d+,\d+/)
    ) {
      discount = cleanPrice(lines[i + 2]);
    }
  }

  return [subtotal, discount];
}

export async function processReceipt(
  buffer: ArrayBuffer
): Promise<ProcessedReceipt> {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const items: ReceiptItem[] = [];
    let fullText = "";
    let currentItem: { description: string[]; price?: number } | null = null;

    // First pass: collect all text
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText +=
        content.items.map((item: { str: string }) => item.str).join(" ") + " ";
    }

    // Split into words and process
    const words = fullText.split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Stop at summary section
      if (word === "SUBTOTAL") {
        break;
      }

      // Start of new item
      if (word.match(/^\([A-C]\)$/)) {
        // Save previous item if exists
        if (currentItem?.description && currentItem?.price) {
          items.push({
            description: currentItem.description.join(" ").trim(),
            price: currentItem.price,
          });
        }
        currentItem = { description: [] };
        continue;
      }

      // Price handling
      if (word.match(/^\d+,\d+$/)) {
        const price = cleanPrice(word);

        // Check for quantity multiplication
        if (i >= 2 && words[i - 1] === "X" && words[i - 2].match(/^\d+$/)) {
          if (currentItem) {
            const quantity = parseInt(words[i - 2]);
            currentItem.price = quantity * price;
          }
        } else if (currentItem && !currentItem.price) {
          currentItem.price = price;
        }
        continue;
      }

      // Skip section headers and discount lines
      if (
        word.includes(":") ||
        word === "Desconto/Poupanca" ||
        word === "Desconto" ||
        word === "Poupanca"
      ) {
        continue;
      }

      // Add word to current item description
      if (currentItem) {
        currentItem.description.push(word);
      }
    }

    // Add final item if exists
    if (currentItem?.description && currentItem?.price) {
      items.push({
        description: currentItem.description.join(" ").trim(),
        price: currentItem.price,
      });
    }

    // Get subtotal and card discount
    const [subtotal, cardDiscount] = findSubtotalAndDiscount(fullText);

    return {
      items: items.filter(
        (item) =>
          item.price > 0 &&
          item.description.length > 0 &&
          !item.description.includes("Desconto")
      ),
      total: subtotal,
      discount: cardDiscount,
    };
  } catch (error) {
    console.error("Error in processReceipt:", error);
    throw error;
  }
}
