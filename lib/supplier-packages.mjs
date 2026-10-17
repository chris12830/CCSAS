// New applications use the shared SAS catalog. Existing source contracts remain
// available only to their current supplier; selecting them must never reprice history.
export const isSharedPackage = pack => !pack.sourceAppId && !pack.supplierId;

export function selectableSupplierPackages(packages, currentPackageId) {
  return packages.filter(pack => pack.enabled && (isSharedPackage(pack) || pack.id === currentPackageId));
}

export function supplierApprovalError(supplier, pack, profile) {
  if (!supplier.policyAcceptedAt) return "Supplier policy acceptance is required before approval.";
  if ((supplier.applicationRequired || pack?.sourceAppId === "owners") &&
      (!profile?.authorizedAt || !profile?.privacyAcceptedAt || !profile?.criteriaSnapshot)) {
    return "The supplier must submit company verification and accept the application criteria before approval.";
  }
}

export function sharedPackageCatalog(state, currency = "CAD") {
  return state.packages.filter(pack => pack.enabled && isSharedPackage(pack)).map(pack => {
    const prices = {CAD: Math.round(pack.cad * 100), USD: Math.round(pack.usd * 100)};
    const billingInterval = pack.billingInterval || "monthly";
    return {
      id: pack.id, name: pack.name, description: pack.description, currency,
      membershipFeeCents: prices[currency], monthlyFeeCents: billingInterval === "monthly" ? prices[currency] : 0,
      prices, billingInterval, maxApps: pack.maxApps, benefits: pack.benefits || [],
      exclusiveCategoryPartner: false,
      applications: state.apps.filter(app => app.enabled && app.packages.includes(pack.id))
        .map(app => ({id: app.id, name: app.name, countries: app.countries})),
    };
  });
}
