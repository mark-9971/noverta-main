import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";

export type MessageGuardian = {
  id: number;
  name: string;
  relationship: string;
  email: string | null;
};

export function useStudentMessageGuardians(studentId: number, enabled: boolean) {
  const [messageGuardians, setMessageGuardians] = useState<MessageGuardian[]>([]);

  useEffect(() => {
    if (!enabled || !studentId) return;
    authFetch(`/api/students/${studentId}/guardians`)
      .then((r: Response) => (r.ok ? r.json() : []))
      .then((d: any) => setMessageGuardians(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [enabled, studentId]);

  return messageGuardians;
}
