import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { materialsApi } from '../api/client';

// The specification catalogue: every material with its fields, and every specification already used.
// Used for suggestions and to recognise an existing specification as values are typed.

const CatalogContext = createContext(null);

export const normValue = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const normKey = (v) => normValue(v).toLowerCase();

export function CatalogProvider({ children }) {
  const [data, setData] = useState(null);
  const refresh = useCallback(() => materialsApi.catalog().then((r) => setData(r.data)).catch(() => setData((d) => d || { materials: [], variants: [] })), []);
  useEffect(() => { refresh(); }, [refresh]);

  const api = useMemo(() => {
    const categories = data?.categories || [];
    const materials = data?.materials || [];
    const variants = data?.variants || [];
    const material = (id) => materials.find((m) => String(m.id) === String(id));
    const keyOf = (materialId, values) => (material(materialId)?.fields || []).map((f) => normKey(values?.[f.id])).join('|');
    const textOf = (materialId, values) => (material(materialId)?.fields || []).map((f) => normValue(values?.[f.id])).filter(Boolean).join(' · ');
    const hasValues = (values) => Object.values(values || {}).some((v) => normValue(v) !== '');
    const findVariant = (materialId, values) => {
      if (!materialId) return null;
      const m = material(materialId);
      if (m && m.fields.length && !hasValues(values)) return null;
      const key = keyOf(materialId, values);
      return variants.find((v) => String(v.material_id) === String(materialId) && v.spec_key === key) || null;
    };
    const variantsOf = (materialId) => variants.filter((v) => String(v.material_id) === String(materialId));
    const suggestions = (materialId, fieldId) => {
      const seen = new Map();
      variantsOf(materialId).forEach((v) => {
        const val = v.values?.[fieldId];
        if (val && !seen.has(val.toLowerCase())) seen.set(val.toLowerCase(), val);
      });
      return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    };
    return { loaded: !!data, categories, materials, variants, material, keyOf, textOf, hasValues, findVariant, variantsOf, suggestions, refresh };
  }, [data, refresh]);

  return <CatalogContext.Provider value={api}>{children}</CatalogContext.Provider>;
}

export const useCatalog = () => useContext(CatalogContext);
