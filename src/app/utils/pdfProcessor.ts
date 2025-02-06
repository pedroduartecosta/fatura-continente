import pdfParse from 'pdf-parse';

interface ReceiptItem {
  description: string;
  price: number;
}

export async function processPDF(buffer: ArrayBuffer): Promise<ReceiptItem[]> {
  try {
    const data = await pdfParse(Buffer.from(buffer));
    const text = data.text;
    
    // TODO: Implement receipt parsing logic
    // This is a placeholder that returns sample data
    return [
      { description: 'Sample Item 1', price: 10.99 },
      { description: 'Sample Item 2', price: 15.50 },
      { description: 'Sample Item 3', price: 8.75 },
    ];
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw error;
  }
}
