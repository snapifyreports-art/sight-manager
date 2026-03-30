"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Package, HardHat } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SuppliersListClient } from "@/components/suppliers/SuppliersListClient";
import { ContactsClient } from "@/components/contacts/ContactsClient";

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactNumber: string | null;
  type: string | null;
  accountNumber: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { orders: number; materials: number };
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: "SUPPLIER" | "CONTRACTOR";
  company: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  suppliers: Supplier[];
  contractors: Contact[];
}

export function SuppliersAndContractorsPage({ suppliers, contractors }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") === "contractors" ? "contractors" : "suppliers";

  function handleTabChange(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/suppliers?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="suppliers">
            <Package className="size-4" />
            Suppliers
          </TabsTrigger>
          <TabsTrigger value="contractors">
            <HardHat className="size-4" />
            Contractors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-4">
          <SuppliersListClient suppliers={suppliers} />
        </TabsContent>

        <TabsContent value="contractors" className="mt-4">
          <ContactsClient contacts={contractors} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
