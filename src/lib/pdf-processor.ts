import * as pdfjsLib from '../../public/pdf.mjs';

export interface ReceiptItem {
  description: string;
  price: number;
}

interface ProcessedReceipt {
  items: ReceiptItem[];
  subtotal: number | null;
  total: number;
  discount: number;
}

function cleanPrice(priceStr: string): number {
  return parseFloat(priceStr.replace(',', '.'));
}

function findSubtotalAndDiscount(
  text: string
): [number | null, number, number] {
  const lines = text.split(/\s+/);
  let subtotal = null;
  let total = 0;
  let discount = 0;

  for (let i = 0; i < lines.length; i++) {
    // Find subtotal if exists
    if (lines[i] === 'SUBTOTAL' && lines[i + 1]?.match(/\d+,\d+/)) {
      subtotal = cleanPrice(lines[i + 1]);
    }

    // Find card discount if exists
    if (
      lines[i] === 'Cartao' &&
      lines[i + 1] === 'Utilizado' &&
      lines[i + 2]?.match(/\d+,\d+/)
    ) {
      discount = cleanPrice(lines[i + 2]);
    }

    // Find total amount
    if (
      lines[i] === 'TOTAL' &&
      lines[i + 1] === 'A' &&
      lines[i + 2] === 'PAGAR' &&
      lines[i + 3]?.match(/\d+,\d+/)
    ) {
      total = cleanPrice(lines[i + 3]);
    } else if (lines[i] === 'TOTAL' && lines[i + 1]?.match(/\d+,\d+/)) {
      // Alternative format for total
      total = cleanPrice(lines[i + 1]);
    }
  }

  // If no subtotal found, calculate from total and discount
  if (subtotal === null && total > 0) {
    subtotal = total + discount;
  }

  return [subtotal, total, discount];
}

export async function processReceipt(
  buffer: ArrayBuffer
): Promise<ProcessedReceipt> {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const items: ReceiptItem[] = [];
    let fullText = '';

    // First pass: collect all text
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText +=
        content.items.map((item: { str: string }) => item.str).join(' ') + ' ';
    }

    // Split into words and process
    const words = fullText.split(/\s+/);
    let currentItem: {
      description: string[];
      price?: number;
      quantity?: number;
    } | null = null;
    let parsingQuantity = false;
    let inItemsSection = false;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Start parsing items after we see the first category or item pattern
      if (
        !inItemsSection &&
        (word.match(/^\([A-C]\)$/) || word === 'Mercearia')
      ) {
        inItemsSection = true;
      }

      // Stop at summary section - be more specific about stopping conditions
      if (inItemsSection && word === 'SUBTOTAL') {
        break;
      }

      // Skip if we haven't started parsing items yet
      if (!inItemsSection) {
        continue;
      }

      // Skip category headers and discount lines
      if (
        word.endsWith(':') ||
        word === 'POUPANCA' ||
        word === 'Desconto/Poupanca' ||
        word === 'DESCONTO' ||
        word === 'DIRETO'
      ) {
        continue;
      }

      // Start of new item with (A), (B), or (C) prefix
      if (word.match(/^\([A-C]\)$/)) {
        // Save previous item if exists and has both description and price
        if (
          currentItem?.description?.length &&
          currentItem?.price !== undefined
        ) {
          items.push({
            description: currentItem.description.join(' ').trim(),
            price: currentItem.price,
          });
        }
        currentItem = { description: [] };
        parsingQuantity = false;
        continue;
      }

      // Handle quantity patterns like "2 X 1,09" or "1,310 X 1,29"
      if (currentItem && !parsingQuantity) {
        // Look for pattern: number X price
        if (
          i + 2 < words.length &&
          words[i + 1] === 'X' &&
          words[i + 2].match(/^\d+,\d+$/)
        ) {
          const quantity = word.match(/^\d+,?\d*$/)
            ? cleanPrice(word)
            : parseInt(word);
          const unitPrice = cleanPrice(words[i + 2]);

          if (!isNaN(quantity) && !isNaN(unitPrice)) {
            currentItem.price = quantity * unitPrice;

            // Save item if we have a description
            if (currentItem.description.length > 0) {
              items.push({
                description: currentItem.description.join(' ').trim(),
                price: currentItem.price,
              });
              currentItem = null;
            }

            i += 2; // Skip the "X" and price
            continue;
          }
        }
      }

      // Handle simple price (no quantity multiplier)
      if (word.match(/^\d+,\d+$/)) {
        const price = cleanPrice(word);

        if (currentItem && currentItem.description.length > 0) {
          currentItem.price = price;

          // Save the item
          items.push({
            description: currentItem.description.join(' ').trim(),
            price: currentItem.price,
          });
          currentItem = null;
        }
        parsingQuantity = false;
        continue;
      }

      // Add word to current item description if we have an active item
      if (currentItem && !parsingQuantity && !word.match(/^\d+,\d+$/)) {
        // Skip pure numbers that might be quantities (unless it's part of a product name)
        if (!word.match(/^\d+$/) || currentItem.description.length > 0) {
          currentItem.description.push(word);
        }
      }
    }

    // Add final item if exists
    if (currentItem?.description?.length && currentItem?.price !== undefined) {
      items.push({
        description: currentItem.description.join(' ').trim(),
        price: currentItem.price,
      });
    }

    // Get subtotal and card discount
    const [subtotal, total, cardDiscount] = findSubtotalAndDiscount(fullText);

    // Filter out invalid items and discount entries
    const validItems = items.filter(
      (item) =>
        item.price > 0 &&
        item.description.length > 0 &&
        !item.description.toLowerCase().includes('desconto') &&
        !item.description.toLowerCase().includes('poupanca') &&
        item.description !== 'DIRETO'
    );

    return {
      items: validItems,
      subtotal: subtotal,
      total: total,
      discount: cardDiscount,
    };
  } catch (error) {
    console.error('Error in processReceipt:', error);
    throw error;
  }
}
