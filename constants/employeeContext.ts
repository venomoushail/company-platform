export const currentCompany = {
  id: "mock-company-uuid",
  name: "Company Name",
} as const;

// TODO: Fetch these from the Supabase locations table once the backend is wired.
export const locations = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    store_number: 1,
    name: "LaGrange",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    store_number: 2,
    name: "Carrollton",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    store_number: 3,
    name: "Bloomfield",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    store_number: 4,
    name: "Shelbyville",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    store_number: 5,
    name: "Middletown",
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    store_number: 6,
    name: "Eminence",
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    store_number: 7,
    name: "Owenton",
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    store_number: 8,
    name: "Crestwood",
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    store_number: 9,
    name: "Taylorsville",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    store_number: 10,
    name: "Warsaw",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    store_number: 11,
    name: "Hodgenville",
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    store_number: 12,
    name: "Bedford",
  },
  {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    store_number: 13,
    name: "Mt. Washington",
  },
  {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    store_number: 14,
    name: "Bardstown",
  },
  {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    store_number: 15,
    name: "Lebanon",
  },
] as const;

export function formatLocationLabel(location: (typeof locations)[number]) {
  return `Store ${location.store_number} - ${location.name}`;
}
