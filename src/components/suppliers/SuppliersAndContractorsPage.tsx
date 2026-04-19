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
  linkedSites?: Array<{ id: string; name: string; status: string; openOrders: number; totalOrders: number }>;
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
  linkedSites?: Array<{ id: string; name: string; status: string; activeJobs: number; totalJobs: number; openOrders: number }>;
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

  // Keith Apr 2026 Q3b: "buttons between suppliers and what should be
  // contractors are messy". Tabs share the same layout + buttons (add /
  // edit / delete are the same verbs) but now carry distinct accent
  // colours — blue for Suppliers (material-order side of the business),
  // amber for Contractors (people on site). A coloured top border on the
  // active tab's panel + an icon-coloured chip makes the current view
  // obvious at a glance.
  const isSuppliers = activeTab === "suppliers";

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger
            value="suppliers"
            className="data-[state=active]:text-blue-700 data-[state=active]:border-blue-500"
          >
            <Package className="size-4 text-blue-600" />
            Suppliers
          </TabsTrigger>
          <TabsTrigger
            value="contractors"
            className="data-[state=active]:text-amber-700 data-[state=active]:border-amber-500"
          >
            <HardHat className="size-4 text-amber-600" />
            Contractors
          </TabsTrigger>
        </TabsList>

        <div className={`mt-4 rounded-lg border-t-2 ${isSuppliers ? "border-t-blue-500 bg-blue-50/20" : "border-t-amber-500 bg-amber-50/20"} px-3 pt-2 pb-3`}>
          <div className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${isSuppliers ? "text-blue-700" : "text-amber-700"}`}>
            {isSuppliers ? (
              <><Package className="size-3.5" /> Material Suppliers — people you order materials from</>
            ) : (
              <><HardHat className="size-3.5" /> Contractors — subcontractors doing work on site</>
            )}
          </div>

          <TabsContent value="suppliers">
            <SuppliersListClient suppliers={suppliers} />
          </TabsContent>

          <TabsContent value="contractors">
            <ContactsClient contacts={contractors} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
