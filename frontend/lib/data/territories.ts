// File: frontend/lib/data/territories.ts

export type StateEntry = {
  name: string;
  cities: string[];
};

export const INDIA_TERRITORIES: StateEntry[] = [
  {
    name: "Andhra Pradesh",
    cities: ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Kakinada", "Nellore", "Kurnool"],
  },
  {
    name: "Assam",
    cities: ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Tinsukia"],
  },
  {
    name: "Bihar",
    cities: ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia"],
  },
  {
    name: "Chandigarh",
    cities: ["Chandigarh"],
  },
  {
    name: "Chhattisgarh",
    cities: ["Raipur", "Bhilai", "Bilaspur", "Durg", "Korba"],
  },
  {
    name: "Delhi",
    cities: ["New Delhi", "Dwarka", "Rohini", "Noida Extension", "Lajpat Nagar"],
  },
  {
    name: "Goa",
    cities: ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
  },
  {
    name: "Gujarat",
    cities: [
      "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar",
      "Bhavnagar", "Jamnagar", "Junagadh", "Anand", "Bharuch",
    ],
  },
  {
    name: "Haryana",
    cities: ["Gurugram", "Faridabad", "Ambala", "Hisar", "Rohtak", "Panipat", "Karnal", "Sonipat"],
  },
  {
    name: "Himachal Pradesh",
    cities: ["Shimla", "Manali", "Dharamshala", "Solan", "Mandi"],
  },
  {
    name: "Jharkhand",
    cities: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Hazaribagh"],
  },
  {
    name: "Karnataka",
    cities: [
      "Bengaluru", "Mysuru", "Hubballi", "Mangaluru", "Belagavi",
      "Kalaburagi", "Davangere", "Shivamogga", "Tumkur",
    ],
  },
  {
    name: "Kerala",
    cities: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Palakkad", "Kannur"],
  },
  {
    name: "Madhya Pradesh",
    cities: ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Rewa"],
  },
  {
    name: "Maharashtra",
    cities: [
      "Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Aurangabad",
      "Solapur", "Kolhapur", "Amravati", "Nanded", "Sangli",
    ],
  },
  {
    name: "Manipur",
    cities: ["Imphal", "Thoubal"],
  },
  {
    name: "Meghalaya",
    cities: ["Shillong", "Tura"],
  },
  {
    name: "Odisha",
    cities: ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur"],
  },
  {
    name: "Punjab",
    cities: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Pathankot"],
  },
  {
    name: "Rajasthan",
    cities: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Bhilwara", "Alwar"],
  },
  {
    name: "Tamil Nadu",
    cities: [
      "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem",
      "Tirunelveli", "Tiruppur", "Vellore", "Erode",
    ],
  },
  {
    name: "Telangana",
    cities: ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Ramagundam"],
  },
  {
    name: "Uttar Pradesh",
    cities: [
      "Lucknow", "Kanpur", "Agra", "Varanasi", "Meerut",
      "Prayagraj", "Ghaziabad", "Noida", "Bareilly", "Aligarh", "Moradabad",
    ],
  },
  {
    name: "Uttarakhand",
    cities: ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rishikesh"],
  },
  {
    name: "West Bengal",
    cities: ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman"],
  },
];

export const ALL_STATES: string[] = INDIA_TERRITORIES.map((t) => t.name);

export function getCitiesForStates(states: string[]): string[] {
  if (states.length === 0) return [];
  const seen = new Set<string>();
  INDIA_TERRITORIES.filter((t) => states.includes(t.name)).forEach((t) =>
    t.cities.forEach((c) => seen.add(c)),
  );
  return Array.from(seen).sort();
}
