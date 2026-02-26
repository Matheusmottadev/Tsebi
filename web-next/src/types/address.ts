export interface Address {
  id: string;
  label: string;
  fullName: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressBook {
  defaultAddressId: string;
  addresses: Address[];
}
