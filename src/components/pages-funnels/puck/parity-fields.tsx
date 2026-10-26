"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageFieldEditor } from "@/components/pages-funnels/puck/image-field";
import type { GalleryImage, LogoItem } from "@/components/pages-funnels/puck/parity-blocks";

function ImageList({ value, onChange, label }: { value: (GalleryImage | LogoItem)[] | undefined; onChange: (value: (GalleryImage | LogoItem)[]) => void; label: string }) {
  const items = value ?? [];
  return <div className="space-y-3"><Label className="text-xs font-semibold">{label}</Label>{items.map((item, index) => <div key={index} className="space-y-2 rounded-md border border-border p-3"><ImageFieldEditor value={item.src} onChange={(src) => onChange(items.map((current, i) => i === index ? { ...current, src } : current))} /><Input aria-label={`${label} ${index + 1} alt text`} value={item.alt} placeholder="Alt text" onChange={(event) => onChange(items.map((current, i) => i === index ? { ...current, alt: event.target.value } : current))} /><Button type="button" variant="outline" size="sm" onClick={() => onChange(items.filter((_, i) => i !== index))}>Remove</Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, { src: "", alt: "" }])}>Add image</Button></div>;
}

export function GalleryImagesField({ value, onChange }: { value: GalleryImage[] | undefined; onChange: (value: GalleryImage[]) => void }) { return <ImageList value={value} onChange={(next) => onChange(next as GalleryImage[])} label="Gallery images" />; }
export function LogoItemsField({ value, onChange }: { value: LogoItem[] | undefined; onChange: (value: LogoItem[]) => void }) { return <ImageList value={value} onChange={(next) => onChange(next as LogoItem[])} label="Logos" />; }
