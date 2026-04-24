import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Mail } from "lucide-react";
import { useEffect, useState } from "react";

const DEFAULT_MESSAGE =
  "This district is scheduled for deletion. Contact support@noverta.education to cancel.";
const SUPPORT_EMAIL = "support@noverta.education";
const STORAGE_KEY = "trellis.districtLockedMessage";

export function setDistrictLockedMessage(message: string | null): void {
  try {
    if (message) sessionStorage.setItem(STORAGE_KEY, message);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sessionStorage may be unavailable */
  }
}

function readStoredMessage(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? DEFAULT_MESSAGE;
  } catch {
    return DEFAULT_MESSAGE;
  }
}

export default function DistrictLockedPage() {
  const [message, setMessage] = useState<string>(DEFAULT_MESSAGE);

  useEffect(() => {
    setMessage(readStoredMessage());
  }, []);

  const subject = encodeURIComponent("District deletion — please cancel");
  const body = encodeURIComponent(
    "Hi Noverta support,\n\nMy district has been scheduled for deletion. " +
      "Please cancel the deletion so we can keep using Noverta.\n\nThanks.",
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="rounded-full bg-amber-100 p-3">
              <ShieldAlert className="h-8 w-8 text-amber-600" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">
              District access is locked
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
            <div className="w-full border-t border-gray-200 my-2" />
            <p className="text-sm text-gray-700">
              Contact Noverta support to cancel the deletion and restore access.
            </p>
            <Button asChild className="gap-2">
              <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`}>
                <Mail className="h-4 w-4" />
                Email {SUPPORT_EMAIL}
              </a>
            </Button>
            <p className="text-xs text-gray-400 mt-2">
              You have been signed out. Sign back in once support has restored
              your district.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
