export interface NavItem {
  href: string;
  label: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const DOCS_NAV: NavGroup[] = [
  { title: "Start", items: [{ href: "/docs/", label: "Quickstart" }] },
  {
    title: "Concepts",
    items: [
      { href: "/concepts/passkey-and-prf/", label: "Passkey and PRF" },
      { href: "/concepts/namespaces/", label: "Namespaces" },
      { href: "/concepts/envelopes/", label: "Envelopes" },
      { href: "/concepts/grants-and-epochs/", label: "Grants and epochs" },
    ],
  },
  {
    title: "Guides",
    items: [
      { href: "/guides/two-apps/", label: "Two apps" },
      { href: "/guides/migrate-from-per-note-vaults/", label: "Migrate from per-note vaults" },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/reference/api/", label: "API" },
      { href: "/reference/errors/", label: "Error codes" },
    ],
  },
];

export const TOP_NAV: NavItem[] = [
  { href: "/pip/", label: "Pip" },
  { href: "/fern/", label: "Fern" },
  { href: "/docs/", label: "Docs" },
  { href: "/proof/", label: "Proof" },
];
