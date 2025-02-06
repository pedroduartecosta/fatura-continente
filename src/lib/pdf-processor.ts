import * as pdfjsLib from "../../public/pdf.mjs";

export interface ReceiptItem {
  description: string;
  price: number;
}

interface ProcessedReceipt {
  items: ReceiptItem[];
  subtotal: number;
  total: number;
  discount: number;
}

function cleanPrice(priceStr: string): number {
  return parseFloat(priceStr.replace(",", "."));
}

function findSubtotalAndDiscount(text: string): [number, number, number] {
  const lines = text.split(/\s+/);
  let subtotal = 0;
  let total = 0;
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

    if (
      lines[i] === "TOTAL" &&
      lines[i + 1] === "A" &&
      lines[i + 2] === "PAGAR" &&
      lines[i + 3]?.match(/\d+,\d+/)
    ) {
      total = cleanPrice(lines[i + 2]);
    }
  }

  return [subtotal, total, discount];
}

export async function processReceipt(
  buffer: ArrayBuffer
): Promise<ProcessedReceipt> {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const items: ReceiptItem[] = [];
    let fullText = "";
    let currentItem: {
      description: string[];
      price?: number;
      quantity?: number;
    } | null = null;
    let parsingQuantity = false;

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

      // Skip discount lines
      if (word === "Desconto/Poupanca") {
        continue;
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
        parsingQuantity = false;
        continue;
      }

      // Look ahead for quantity pattern
      if (currentItem && !parsingQuantity) {
        const nextThreeWords = words.slice(i, i + 3);
        const isQuantityPattern =
          nextThreeWords.length === 3 &&
          nextThreeWords[0].match(/^\d+$/) &&
          nextThreeWords[1] === "X" &&
          nextThreeWords[2].match(/^\d+,\d+$/);

        if (isQuantityPattern) {
          const quantity = parseInt(nextThreeWords[0]);
          const unitPrice = cleanPrice(nextThreeWords[2]);
          currentItem.price = quantity * unitPrice;

          // Save and reset item
          if (currentItem.description.length > 0) {
            items.push({
              description: currentItem.description.join(" ").trim(),
              price: currentItem.price,
            });
            currentItem = null;
          }

          i += 2; // Skip the quantity pattern
          continue;
        }
      }

      // Weight/quantity handling for fruits and vegetables
      if (word.match(/^\d+,\d+$/) && words[i + 1] === "X") {
        if (currentItem) {
          currentItem.quantity = cleanPrice(word);
          parsingQuantity = true;
        }
        i++; // Skip the "X"
        continue;
      }

      // Price handling
      if (word.match(/^\d+,\d+$/)) {
        const price = cleanPrice(word);

        if (currentItem) {
          // If we have a quantity (for weighted items), multiply
          if (currentItem.quantity) {
            currentItem.price = currentItem.quantity * price;
          } else {
            currentItem.price = price;
          }

          // Save and reset the item when we have both description and price
          if (currentItem.description.length > 0) {
            items.push({
              description: currentItem.description.join(" ").trim(),
              price: currentItem.price,
            });
            currentItem = null;
          }
        }
        parsingQuantity = false;
        continue;
      }

      // Add word to current item description if not in quantity mode
      if (currentItem && !parsingQuantity) {
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
    const [subtotal, total, cardDiscount] = findSubtotalAndDiscount(fullText);

    return {
      items: items.filter(
        (item) =>
          item.price > 0 &&
          item.description.length > 0 &&
          !item.description.includes("Desconto")
      ),
      subtotal: subtotal,
      total: total,
      discount: cardDiscount,
    };
  } catch (error) {
    console.error("Error in processReceipt:", error);
    throw error;
  }
}
