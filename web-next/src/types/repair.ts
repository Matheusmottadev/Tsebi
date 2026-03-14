export interface RepairPhoto {
  url: string;
  fileName: string;
}

export type RepairStatus = "pending" | "accepted" | "rejected";

export interface RepairRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  orderId: string;
  orderRef: string;
  orderItemId: string;
  pieceName: string;
  pieceImageUrl: string | null;
  repairType: string;
  description: string;
  returnAddress: string;
  photos: RepairPhoto[];
  status: RepairStatus;
  rejectionReason: string;
  adminNote: string;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
