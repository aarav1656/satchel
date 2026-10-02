export interface NavItem {
  href: string;
  label: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const DOCS_NAV: NavGroup[] = [
  { title: "Start", items: [{ href: "/", label: "Quickstart" }] },
  {
    title: "Concepts",
    items: [
      { href: "/concepts/passkey-and-prf/", label: "Passkey and PRF" },
      { href: "/concepts/namespaces/", label: "Namespaces" },
      { href: "/concepts/envelopes/", label: "Envelopes" },
      { href: "/concepts/grants-and-epochs/", label: "Grants and epochs" },
    ],
  },
  { title: "Guides", items: [{ href: "/guides/migrate-from-hkdf/", label: "Migrate from per-note vaults" }] },
  {
    title: "Reference",
    items: [
      { href: "/reference/api/", label: "API" },
      { href: "/reference/errors/", label: "Error codes" },
    ],
  },
];

export const TOP_NAV: NavItem[] = [
  { href: "/", label: "Docs" },
  { href: "/pip/", label: "Pip" },
  { href: "/fern/", label: "Fern" },
  { href: "/proof/", label: "Proof" },
];
