import { useCallback, useEffect, useState } from 'react';
import { itemsApi } from '../api/client';
import { PhotoThumb } from '../components/Photo';
import { DrawingLink } from '../components/Drawing';

// Order item fields (your own list) with suggestions from values typed before.
export function useItemFields() {
  const [data, setData] = useState(null);
  const reload = useCallback(() => itemsApi.fields().then((r) => setData({ fields: r.data, suggestions: r.suggestions || {} })).catch(() => setData((d) => d || { fields: [], suggestions: {} })), []);
  useEffect(() => { reload(); }, [reload]);
  return { loaded: !!data, fields: data?.fields || [], suggestions: data?.suggestions || {}, reload };
}

// Order item details, one per line with the label in bold: "Size: 6.5 ft X 6.5 ft"
export function ItemDetailLines({ details, empty = null }) {
  if (!details?.length) return empty;
  return (
    <div className="space-y-0.5">
      {details.map((d, i) => <div key={i}><span className="font-semibold text-gray-900">{d.name}:</span> <span className="text-gray-700">{d.value}</span></div>)}
    </div>
  );
}

// The order item: area, its details (one per line) and remarks
export function ItemText({ item, remarks = true, className = '' }) {
  if (!item) return null;
  return (
    <div className={className}>
      {item.area && <div className="font-semibold text-gray-900">{item.area}</div>}
      <ItemDetailLines details={item.details} empty={!item.area ? <span className="text-gray-400">No details</span> : null} />
      {remarks && item.remarks && <div className="text-xs italic text-gray-500">{item.remarks}</div>}
    </div>
  );
}

// Component picture + reference image thumbnails
export function ItemPhotos({ item, className = 'h-12 w-12' }) {
  if (!item?.component_image && !item?.reference_image && !item?.drawing_file) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <PhotoThumb path={item.component_image} title="Component picture" className={className} />
      <PhotoThumb path={item.reference_image} title="Reference image" className={className} />
      {item.drawing_file && <DrawingLink compact path={item.drawing_file} name={item.drawing_name} title={item.item_title} />}
    </div>
  );
}
