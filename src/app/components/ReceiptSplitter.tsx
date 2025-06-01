/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, FilePlus, Plus, X, Users, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { processReceipt, type ReceiptItem } from '@/lib/pdf-processor';
import PDFViewer from './pdfviewer';

interface ItemAllocation {
  forAll: boolean;
  people: Record<string, boolean>;
}

interface ProcessedTotals {
  subtotal: number;
  discount: number;
  finalTotal: number;
  totals: Record<string, number>;
}

export const ReceiptSplitter = () => {
  const [file, setFile] = useState<File | null>(null);
  const [showPDF, setShowPDF] = useState(false);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [newPerson, setNewPerson] = useState('');
  const [allocations, setAllocations] = useState<
    Record<number, ItemAllocation>
  >({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<ProcessedTotals | null>(null);
  const [cardDiscount, setCardDiscount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'items' | 'summary'>('items');
  const [includeDiscount, setIncludeDiscount] = useState(true);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'application/pdf') {
      setFile(droppedFile);
      processFile(droppedFile);
    }
  }, []);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      processFile(selectedFile);
    }
  }, []);

  const addPerson = () => {
    if (newPerson.trim() && !people.includes(newPerson.trim())) {
      setPeople([...people, newPerson.trim()]);
      setNewPerson('');

      // Update allocations with the new person
      const updatedAllocations = { ...allocations };
      Object.keys(updatedAllocations).forEach((index) => {
        updatedAllocations[Number(index)].people[newPerson.trim()] = false;
      });
      setAllocations(updatedAllocations);
    }
  };

  const removePerson = (personToRemove: string) => {
    setPeople(people.filter((person) => person !== personToRemove));

    // Update allocations removing the person
    const updatedAllocations = { ...allocations };
    Object.keys(updatedAllocations).forEach((index) => {
      const { [personToRemove]: _, ...remainingPeople } =
        updatedAllocations[Number(index)].people;
      updatedAllocations[Number(index)].people = remainingPeople;
    });
    setAllocations(updatedAllocations);
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { items, total, subtotal, discount } = await processReceipt(
        arrayBuffer
      );

      setItems(items);
      setCardDiscount(discount);

      // Initialize allocations with everything split evenly by default
      const initialAllocations: Record<number, ItemAllocation> = {};
      items.forEach((_, index) => {
        initialAllocations[index] = {
          forAll: true,
          people: people.reduce(
            (acc, person) => ({ ...acc, [person]: false }),
            {}
          ),
        };
      });
      setAllocations(initialAllocations);
    } catch (error) {
      console.error('Error processing receipt:', error);
      setError(
        "Failed to process the receipt. Please make sure it's a valid PDF receipt."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleAllocation = (itemIndex: number, person: string) => {
    setAllocations((prev) => {
      const currentAllocation = prev[itemIndex];
      const newPeople = { ...currentAllocation.people };

      // If clicking the same person again when they're the only one selected,
      // reset to split among all
      const currentlySelected = Object.entries(newPeople).filter(
        ([_, selected]) => selected
      );
      if (
        currentlySelected.length === 1 &&
        currentlySelected[0][0] === person &&
        newPeople[person]
      ) {
        return {
          ...prev,
          [itemIndex]: {
            forAll: true,
            people: Object.keys(newPeople).reduce(
              (acc, p) => ({ ...acc, [p]: false }),
              {}
            ),
          },
        };
      }

      // Otherwise, toggle the person and set forAll to false
      newPeople[person] = !newPeople[person];
      return {
        ...prev,
        [itemIndex]: {
          forAll: false,
          people: newPeople,
        },
      };
    });
  };

  const calculateSplit = useCallback(() => {
    if (items.length === 0 || people.length === 0) return null;

    const personTotals: Record<string, number> = people.reduce(
      (acc, person) => ({ ...acc, [person]: 0 }),
      {}
    );
    let subtotal = 0;

    // First calculate the base amounts without discount
    items.forEach((item, index) => {
      const allocation = allocations[index];
      if (!allocation) return;

      subtotal += item.price;

      if (allocation.forAll) {
        // Split evenly among all people
        const perPerson = item.price / people.length;
        people.forEach((person) => {
          personTotals[person] += perPerson;
        });
      } else {
        // Split among selected people
        const selectedPeople = Object.entries(allocation.people)
          .filter(([_, selected]) => selected)
          .map(([person]) => person);

        if (selectedPeople.length > 0) {
          const perPerson = item.price / selectedPeople.length;
          selectedPeople.forEach((person) => {
            personTotals[person] += perPerson;
          });
        } else {
          // If no specific people are selected, split evenly
          const perPerson = item.price / people.length;
          people.forEach((person) => {
            personTotals[person] += perPerson;
          });
        }
      }
    });

    // Apply card discount evenly among all people only if includeDiscount is true
    if (includeDiscount) {
      const discountPerPerson = cardDiscount / people.length;
      Object.keys(personTotals).forEach((person) => {
        personTotals[person] -= discountPerPerson;
      });
    }

    const finalTotal = Object.values(personTotals).reduce(
      (sum, amount) => sum + amount,
      0
    );

    return {
      subtotal,
      discount: includeDiscount ? cardDiscount : 0,
      finalTotal,
      totals: personTotals,
    };
  }, [items, people, allocations, cardDiscount, includeDiscount]);

  // Update totals whenever allocations change
  useEffect(() => {
    const newTotals = calculateSplit();
    if (newTotals) {
      setTotals(newTotals);
    }
  }, [calculateSplit]);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6">
      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">
          Receipt Splitter
        </h1>
      </div>

      {!file ? (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              <Upload className="mx-auto h-8 w-8 md:h-12 md:w-12 text-gray-400 mb-3" />
              <p className="text-gray-600 mb-4">
                Drop your receipt PDF here, or
              </p>
              <div className="relative inline-block">
                <input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".pdf"
                  onChange={onFileSelect}
                  aria-label="Upload PDF"
                />
                <Button variant="outline" className="pointer-events-none">
                  <FilePlus className="mr-2 h-4 w-4" />
                  Select File
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Tabs */}
          <div className="flex gap-2 mb-4 md:hidden">
            <Button
              variant={activeTab === 'items' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setActiveTab('items')}
            >
              Items
            </Button>
            <Button
              variant={activeTab === 'summary' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setActiveTab('summary')}
            >
              Summary
            </Button>
          </div>

          {/* Desktop Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - People and Summary */}
            <div
              className={`space-y-6 ${
                activeTab === 'items' ? 'hidden md:block' : ''
              }`}
            >
              <Card>
                <CardHeader>
                  <CardTitle>People</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-4">
                    <Input
                      placeholder="Add person"
                      value={newPerson}
                      onChange={(e) => setNewPerson(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addPerson()}
                    />
                    <Button onClick={addPerson}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {people.map((person) => (
                      <Badge
                        key={person}
                        variant="secondary"
                        className="flex items-center gap-1 p-2"
                      >
                        {person}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePerson(person)}
                          className="h-4 w-4 p-0 hover:bg-transparent"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {totals && (
                <Card>
                  <CardHeader>
                    <CardTitle>Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {cardDiscount > 0 && (
                        <div className="flex items-center space-x-2 mb-4">
                          <input
                            id="discount-toggle"
                            type="checkbox"
                            checked={includeDiscount}
                            onChange={(e) =>
                              setIncludeDiscount(e.target.checked)
                            }
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label
                            htmlFor="discount-toggle"
                            className="text-sm font-medium"
                          >
                            Include card discount
                          </label>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span>Subtotal:</span>
                        <span className="text-right">
                          €{totals.subtotal.toFixed(2)}
                        </span>
                        <span>Card Discount:</span>
                        <span className="text-right">
                          -€{totals.discount.toFixed(2)}
                        </span>
                        <span className="font-medium">Final Total:</span>
                        <span className="text-right font-medium">
                          €{totals.finalTotal.toFixed(2)}
                        </span>
                      </div>

                      <div className="pt-4 border-t">
                        <h3 className="font-medium mb-3">Split Results</h3>
                        <div className="space-y-2">
                          {Object.entries(totals.totals).map(
                            ([person, amount]) => (
                              <div
                                key={person}
                                className="flex justify-between items-center p-3 bg-gray-50 rounded"
                              >
                                <span>{person}</span>
                                <span className="font-medium">
                                  €{amount.toFixed(2)}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* PDF Toggle Button */}
              <div className="mb-4">
                <Button
                  variant="outline"
                  onClick={() => setShowPDF(!showPDF)}
                  className="w-full md:w-auto"
                >
                  {showPDF ? (
                    <>
                      <EyeOff className="mr-2 h-4 w-4" />
                      Hide Receipt
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      View Receipt
                    </>
                  )}
                </Button>
              </div>

              {/* PDF Viewer */}
              {showPDF && (
                <Card className="mb-6">
                  <CardContent className="pt-6">
                    <PDFViewer file={file} />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column - Items */}
            <div
              className={`h-auto ${
                activeTab === 'summary' ? 'hidden md:block' : ''
              }`}
            >
              <Card className="h-auto">
                <CardHeader>
                  <CardTitle>Receipt Items</CardTitle>
                </CardHeader>
                <CardContent className="h-[calc(80vh-12rem)] overflow-y-auto">
                  {error && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {isProcessing ? (
                    <div className="text-center py-4">
                      Processing receipt...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {items.map((item, index) => {
                        const allocation = allocations[index];
                        const selectedPeople = allocation
                          ? Object.entries(allocation.people)
                              .filter(([_, selected]) => selected)
                              .map(([person]) => person)
                          : [];

                        return (
                          <div key={index} className="p-4 border rounded-lg">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <p className="font-medium">
                                  {item.description}
                                </p>
                                <p className="text-sm text-gray-500">
                                  €{item.price.toFixed(2)}
                                </p>
                              </div>
                            </div>

                            {/* Split indicator */}
                            <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
                              <Users className="h-4 w-4" />
                              {allocation?.forAll ? (
                                <span>Split among everyone</span>
                              ) : (
                                <span>
                                  {selectedPeople.length === 0
                                    ? 'Split among everyone'
                                    : `Split between ${selectedPeople.join(
                                        ', '
                                      )}`}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {people.map((person) => (
                                <Button
                                  key={person}
                                  variant={
                                    allocation?.people[person]
                                      ? 'default'
                                      : 'outline'
                                  }
                                  size="sm"
                                  onClick={() =>
                                    toggleAllocation(index, person)
                                  }
                                  className="text-sm"
                                >
                                  {person}
                                </Button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
