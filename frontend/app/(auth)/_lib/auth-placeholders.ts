export type LoginPayload = {
  email: string;
  password: string;
};

export type SignupPayload = {
  name: string;
  email: string;
  password: string;
  role: "salesperson" | "distributor";
};

// These placeholders keep UI and auth wiring separate.
// Swap these with Firebase auth calls later.
export async function loginWithEmail(_payload: LoginPayload): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 900));
}

export async function signupWithEmail(_payload: SignupPayload): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 900));
}
