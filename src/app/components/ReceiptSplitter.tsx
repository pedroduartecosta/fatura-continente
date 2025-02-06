"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Upload, FilePlus, Plus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { processReceipt, type ReceiptItem } from "@/lib/pdf-processor";

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
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [newPerson, setNewPerson] = useState("");
  const [allocations, setAllocations] = useState<
    Record<number, ItemAllocation>
  >({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<ProcessedTotals | null>(null);
  const [originalTotal, setOriginalTotal] = useState<number>(0);
  const [cardDiscount, setCardDiscount] = useState<number>(0);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === "application/pdf") {
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
      setNewPerson("");

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
      const { items, total, discount } = await processReceipt(arrayBuffer);

      setItems(items);
      setOriginalTotal(total);
      setCardDiscount(discount);

      // Initialize allocations
      const initialAllocations: Record<number, ItemAllocation> = {};
      items.forEach((_, index) => {
        initialAllocations[index] = {
          forAll: false,
          people: people.reduce(
            (acc, person) => ({ ...acc, [person]: false }),
            {}
          ),
        };
      });
      setAllocations(initialAllocations);
    } catch (error) {
      console.error("Error processing receipt:", error);
      setError(
        "Failed to process the receipt. Please make sure it's a valid PDF receipt."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleAllocation = (itemIndex: number, person: string) => {
    setAllocations((prev) => ({
      ...prev,
      [itemIndex]: {
        ...prev[itemIndex],
        people: {
          ...prev[itemIndex].people,
          [person]: !prev[itemIndex].people[person],
        },
        forAll: false,
      },
    }));
  };

  const toggleForAll = (itemIndex: number) => {
    setAllocations((prev) => ({
      ...prev,
      [itemIndex]: {
        forAll: !prev[itemIndex].forAll,
        people: people.reduce(
          (acc, person) => ({ ...acc, [person]: false }),
          {}
        ),
      },
    }));
  };

  const calculateSplit = useCallback(() => {
    if (items.length === 0 || people.length === 0) return null;

    const personTotals: Record<string, number> = people.reduce(
      (acc, person) => ({ ...acc, [person]: 0 }),
      {}
    );
    let subtotal = 0;

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
        }
      }
    });

    // Apply card discount proportionally
    const discountMultiplier = (subtotal - cardDiscount) / subtotal;
    Object.keys(personTotals).forEach((person) => {
      personTotals[person] *= discountMultiplier;
    });

    const finalTotal = Object.values(personTotals).reduce(
      (sum, amount) => sum + amount,
      0
    );

    return {
      subtotal,
      discount: cardDiscount,
      finalTotal,
      totals: personTotals,
    };
  }, [items, people, allocations, cardDiscount]);

  // Update totals whenever allocations change
  useEffect(() => {
    const newTotals = calculateSplit();
    if (newTotals) {
      setTotals(newTotals);
    }
  }, [calculateSplit]);

  return (
    <div className="w-full max-w-7xl mx-auto">
      {!file ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Receipt Splitter</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600">Drop your receipt PDF here, or</p>
              <label className="mt-2 inline-block">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf"
                  onChange={onFileSelect}
                />
                <Button variant="outline" className="mt-2">
                  <FilePlus className="mr-2 h-4 w-4" />
                  Select File
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - People and Summary */}
          <div className="space-y-6">
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
                    onKeyPress={(e) => e.key === "Enter" && addPerson()}
                  />
                  <Button onClick={addPerson}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {people.map((person) => (
                    <div
                      key={person}
                      className="flex justify-between items-center p-2 bg-gray-50 rounded"
                    >
                      <span>{person}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePerson(person)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
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
                    <div>
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
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">Split Results</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {Object.entries(totals.totals).map(
                          ([person, amount]) => (
                            <React.Fragment key={person}>
                              <span>{person}'s Share:</span>
                              <span className="text-right">
                                €{amount.toFixed(2)}
                              </span>
                            </React.Fragment>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Items */}
          <div className="h-screen pb-6">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Receipt Items</CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-5rem)] overflow-y-auto">
                {error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {isProcessing ? (
                  <div className="text-center py-4">Processing receipt...</div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium">{item.description}</p>
                            <p className="text-sm text-gray-500">
                              €{item.price.toFixed(2)}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleForAll(index)}
                            className={
                              allocations[index]?.forAll ? "bg-blue-100" : ""
                            }
                          >
                            Split Evenly
                          </Button>
                        </div>
                        {!allocations[index]?.forAll && (
                          <div className="flex flex-wrap gap-4 mt-2">
                            {people.map((person) => (
                              <div
                                key={person}
                                className="flex items-center space-x-2"
                              >
                                <Checkbox
                                  id={`${index}-${person}`}
                                  checked={allocations[index]?.people[person]}
                                  onCheckedChange={() =>
                                    toggleAllocation(index, person)
                                  }
                                />
                                <label
                                  htmlFor={`${index}-${person}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  {person}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
