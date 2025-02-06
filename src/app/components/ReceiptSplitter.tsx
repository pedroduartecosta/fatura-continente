'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FilePlus, Trash2 } from 'lucide-react';
import Papa from 'papaparse';

interface ReceiptItem {
  description: string;
  price: number;
  participants: string[];
}

interface Person {
  id: string;
  name: string;
}

const ReceiptSplitter = () => {
  const [file, setFile] = useState<File | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [newPersonName, setNewPersonName] = useState('');
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'application/pdf') {
      setFile(droppedFile);
      processReceipt(droppedFile);
    }
  }, []);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      processReceipt(selectedFile);
    }
  }, []);

  const processReceipt = async (file: File) => {
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Here you would process the PDF using pdf.js or a similar library
      // For now, we'll add some sample items
      const sampleItems: ReceiptItem[] = [
        { description: 'Sample Item 1', price: 10.99, participants: [] },
        { description: 'Sample Item 2', price: 15.50, participants: [] },
        { description: 'Sample Item 3', price: 8.75, participants: [] },
      ];
      setItems(sampleItems);
    } catch (error) {
      console.error('Error processing receipt:', error);
    }
    setIsProcessing(false);
  };

  const addPerson = () => {
    if (newPersonName.trim()) {
      setPeople([...people, { id: Date.now().toString(), name: newPersonName.trim() }]);
      setNewPersonName('');
    }
  };

  const removePerson = (id: string) => {
    setPeople(people.filter(person => person.id !== id));
    setItems(items.map(item => ({
      ...item,
      participants: item.participants.filter(p => p !== id)
    })));
  };

  const toggleParticipant = (itemIndex: number, personId: string) => {
    setItems(items.map((item, index) => {
      if (index === itemIndex) {
        const participants = item.participants.includes(personId)
          ? item.participants.filter(p => p !== personId)
          : [...item.participants, personId];
        return { ...item, participants };
      }
      return item;
    }));
  };

  const setAllParticipants = (itemIndex: number) => {
    setItems(items.map((item, index) => {
      if (index === itemIndex) {
        return { ...item, participants: people.map(p => p.id) };
      }
      return item;
    }));
  };

  const calculateTotals = () => {
    const newTotals: Record<string, number> = {};
    
    items.forEach(item => {
      const numParticipants = item.participants.length;
      if (numParticipants > 0) {
        const splitAmount = item.price / numParticipants;
        item.participants.forEach(participantId => {
          newTotals[participantId] = (newTotals[participantId] || 0) + splitAmount;
        });
      }
    });
    
    setTotals(newTotals);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Receipt Splitter</CardTitle>
        </CardHeader>
        <CardContent>
          {/* File Upload Section */}
          <div 
            className="border-2 border-dashed rounded-lg p-8 text-center mb-6"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            {!file ? (
              <div>
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600">Drag and drop your receipt PDF here, or</p>
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
            ) : (
              <div className="flex items-center justify-between">
                <span>{file.name}</span>
                <Button
                  variant="ghost"
                  onClick={() => setFile(null)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* People Management Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">People</h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                className="flex-1 p-2 border rounded"
                placeholder="Enter name"
              />
              <Button onClick={addPerson}>Add Person</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {people.map(person => (
                <div key={person.id} className="flex items-center gap-2 bg-gray-100 rounded px-3 py-1">
                  <span>{person.name}</span>
                  <button
                    onClick={() => removePerson(person.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Items Section */}
          {items.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Items</h3>
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="border rounded p-4">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{item.description}</span>
                      <span>€{item.price.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {people.map(person => (
                        <label key={person.id} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={item.participants.includes(person.id)}
                            onChange={() => toggleParticipant(index, person.id)}
                            className="rounded"
                          />
                          <span>{person.name}</span>
                        </label>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAllParticipants(index)}
                      >
                        Split Among All
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                className="mt-6"
                onClick={calculateTotals}
              >
                Calculate Split
              </Button>

              {/* Totals Display */}
              {Object.keys(totals).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Final Split</h3>
                  <div className="space-y-2">
                    {people.map(person => (
                      <div key={person.id} className="flex justify-between">
                        <span>{person.name}</span>
                        <span>€{(totals[person.id] || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReceiptSplitter;
