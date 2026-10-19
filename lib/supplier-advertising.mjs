export const AD_MESSAGE_LIMIT = 100;
export const SUPPLIER_AD_NAME_LIMIT = 40;

export function adCharacterCount(text) {
  return Array.from(text).length;
}

export function supplierAdvertisingName(supplier) {
  const name = supplier?.advertisingName?.trim() || supplier?.name?.trim() || "Supplier";
  const characters = Array.from(name);
  return characters.length > SUPPLIER_AD_NAME_LIMIT
    ? characters.slice(0, SUPPLIER_AD_NAME_LIMIT - 1).join("") + "…"
    : name;
}
