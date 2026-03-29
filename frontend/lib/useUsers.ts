// File: frontend/lib/useUsers.ts
"use client";

import { useEffect, useState } from "react";

import { getAllUsers } from "@/lib/services/userService";
import type { User } from "@/types/user";

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersData = await getAllUsers();
        setUsers(usersData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch users");
      } finally {
        setLoading(false);
      }
    };

    void fetchUsers();
  }, []);

  return { users, loading, error };
}
