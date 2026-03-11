"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

const BRAZIL_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

type OrderItemDraft = {
  productId: string;
  quantity: string;
  color: string;
  size: string;
};

type DrawerNovoPedidoProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function buildEmptyItem(): OrderItemDraft {
  return { productId: "", quantity: "1", color: "", size: "" };
}

export function DrawerNovoPedido({ isOpen, onClose, onSaved }: DrawerNovoPedidoProps) {
  const [items, setItems] = useState<OrderItemDraft[]>([buildEmptyItem()]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const [optionalOpen, setOptionalOpen] = useState(false);
  const [cpf, setCpf] = useState("");
  const [complement, setComplement] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [installments, setInstallments] = useState("1");
  const [coupon, setCoupon] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const cepDigits = cep.replace(/\D/g, "");
    if (cepDigits.length !== 8) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
          erro?: boolean;
        };
        if (cancelled || data.erro) return;

        if (data.logradouro) setStreet(data.logradouro);
        if (data.bairro) setNeighborhood(data.bairro);
        if (data.localidade) setCity(data.localidade);
        if (data.uf) setState(data.uf);
      } catch {
        // ignore network errors from postal lookup
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cep]);

  const requiredValid = useMemo(() => {
    const allItemsValid =
      items.length > 0 &&
      items.every((item) => item.productId.trim() && Number(item.quantity) > 0 && item.color.trim() && item.size.trim());
    if (!allItemsValid) return false;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return false;
    if (!fullName.trim()) return false;
    if (!phone.trim()) return false;
    if (cep.replace(/\D/g, "").length !== 8) return false;
    if (!street.trim()) return false;
    if (!number.trim()) return false;
    if (!neighborhood.trim()) return false;
    if (!city.trim()) return false;
    if (!state.trim()) return false;
    return true;
  }, [items, email, fullName, phone, cep, street, number, neighborhood, city, state]);

  function addItem() {
    setItems((current) => [...current, buildEmptyItem()]);
  }

  function updateItem(index: number, patch: Partial<OrderItemDraft>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function validate() {
    const nextErrors: Record<string, string> = {};

    if (!items.length || items.some((item) => !item.productId.trim() || Number(item.quantity) <= 0 || !item.color.trim() || !item.size.trim())) {
      nextErrors.items = "Preencha ID, quantidade, cor e tamanho em todos os itens.";
    }

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = "Informe um e-mail válido.";
    if (!fullName.trim()) nextErrors.fullName = "Informe o nome completo.";
    if (!phone.trim()) nextErrors.phone = "Informe o telefone.";
    if (cep.replace(/\D/g, "").length !== 8) nextErrors.cep = "CEP deve ter 8 dígitos.";
    if (!street.trim()) nextErrors.street = "Informe a rua.";
    if (!number.trim()) nextErrors.number = "Informe o número.";
    if (!neighborhood.trim()) nextErrors.neighborhood = "Informe o bairro.";
    if (!city.trim()) nextErrors.city = "Informe a cidade.";
    if (!state.trim()) nextErrors.state = "Informe o estado.";

    if (cpf && cpf.replace(/\D/g, "").length !== 11) {
      nextErrors.cpf = "CPF deve ter 11 dígitos.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setIsSubmitting(true);
    setErrors({});

    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      onClose();
      onSaved();

      setItems([buildEmptyItem()]);
      setEmail("");
      setFullName("");
      setPhone("");
      setCep("");
      setStreet("");
      setNumber("");
      setNeighborhood("");
      setCity("");
      setState("");
      setOptionalOpen(false);
      setCpf("");
      setComplement("");
      setPaymentMethod("");
      setInstallments("1");
      setCoupon("");
      setShippingMethod("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Pedido"
      subtitle="Preencha os dados do pedido"
      onSave={handleSave}
      disableSave={!requiredValid || isSubmitting}
      saveLabel={isSubmitting ? "Salvando..." : "Salvar"}
    >
      <div className={form.stack}>
        <div className={form.field}>
          <span className={form.label}>Itens</span>

          <div className={form.stack}>
            {items.map((item, index) => (
              <div key={`item-${index}`} className={form.itemBox}>
                {items.length > 1 ? (
                  <button type="button" className={form.itemRemoveBtn} onClick={() => removeItem(index)} aria-label="Remover item">
                    <X size={12} />
                  </button>
                ) : null}

                <div className={form.itemGrid}>
                  <div className={form.field}>
                    <label className={form.label}>Produto por ID</label>
                    <input
                      className={form.input}
                      value={item.productId}
                      onChange={(event) => updateItem(index, { productId: event.target.value })}
                      placeholder="id-do-produto"
                    />
                  </div>

                  <div className={form.field}>
                    <label className={form.label}>Quantidade</label>
                    <input
                      className={form.input}
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) => updateItem(index, { quantity: event.target.value })}
                    />
                  </div>

                  <div className={form.field}>
                    <label className={form.label}>Cor</label>
                    <input
                      className={form.input}
                      value={item.color}
                      onChange={(event) => updateItem(index, { color: event.target.value })}
                      placeholder="Ex: Preto"
                    />
                  </div>

                  <div className={form.field}>
                    <label className={form.label}>Tamanho</label>
                    <select
                      className={form.select}
                      value={item.size}
                      onChange={(event) => updateItem(index, { size: event.target.value })}
                    >
                      <option value="">Selecione</option>
                      <option value="PP">PP</option>
                      <option value="P">P</option>
                      <option value="M">M</option>
                      <option value="G">G</option>
                      <option value="GG">GG</option>
                      <option value="XG">XG</option>
                      <option value="UNICO">Único</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className={form.inlineBtn} onClick={addItem}>
            <Plus size={12} style={{ marginRight: 6 }} />
            Adicionar item
          </button>

          {errors.items ? <p className={form.error}>{errors.items}</p> : null}
        </div>

        <div className={form.row2}>
          <div className={form.field}>
            <label className={form.label} htmlFor="order-email">
              E-mail
            </label>
            <input
              id="order-email"
              className={`${form.input} ${errors.email ? form.inputError : ""}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {errors.email ? <p className={form.error}>{errors.email}</p> : null}
          </div>

          <div className={form.field}>
            <label className={form.label} htmlFor="order-fullName">
              Nome completo
            </label>
            <input
              id="order-fullName"
              className={`${form.input} ${errors.fullName ? form.inputError : ""}`}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
            {errors.fullName ? <p className={form.error}>{errors.fullName}</p> : null}
          </div>
        </div>

        <div className={form.row2}>
          <div className={form.field}>
            <label className={form.label} htmlFor="order-phone">
              Telefone
            </label>
            <input
              id="order-phone"
              className={`${form.input} ${errors.phone ? form.inputError : ""}`}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            {errors.phone ? <p className={form.error}>{errors.phone}</p> : null}
          </div>

          <div className={form.field}>
            <label className={form.label} htmlFor="order-cep">
              CEP
            </label>
            <input
              id="order-cep"
              className={`${form.input} ${errors.cep ? form.inputError : ""}`}
              value={cep}
              onChange={(event) => setCep(event.target.value)}
            />
            {errors.cep ? <p className={form.error}>{errors.cep}</p> : null}
          </div>
        </div>

        <div className={form.row2}>
          <div className={form.field}>
            <label className={form.label} htmlFor="order-street">
              Rua
            </label>
            <input
              id="order-street"
              className={`${form.input} ${errors.street ? form.inputError : ""}`}
              value={street}
              onChange={(event) => setStreet(event.target.value)}
            />
            {errors.street ? <p className={form.error}>{errors.street}</p> : null}
          </div>

          <div className={form.field}>
            <label className={form.label} htmlFor="order-number">
              Número
            </label>
            <input
              id="order-number"
              className={`${form.input} ${errors.number ? form.inputError : ""}`}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />
            {errors.number ? <p className={form.error}>{errors.number}</p> : null}
          </div>
        </div>

        <div className={form.row2}>
          <div className={form.field}>
            <label className={form.label} htmlFor="order-neighborhood">
              Bairro
            </label>
            <input
              id="order-neighborhood"
              className={`${form.input} ${errors.neighborhood ? form.inputError : ""}`}
              value={neighborhood}
              onChange={(event) => setNeighborhood(event.target.value)}
            />
            {errors.neighborhood ? <p className={form.error}>{errors.neighborhood}</p> : null}
          </div>

          <div className={form.field}>
            <label className={form.label} htmlFor="order-city">
              Cidade
            </label>
            <input
              id="order-city"
              className={`${form.input} ${errors.city ? form.inputError : ""}`}
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
            {errors.city ? <p className={form.error}>{errors.city}</p> : null}
          </div>
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="order-state">
            Estado
          </label>
          <select
            id="order-state"
            className={`${form.select} ${errors.state ? form.selectError : ""}`}
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">Selecione</option>
            {BRAZIL_STATES.map((stateOption) => (
              <option key={stateOption} value={stateOption}>
                {stateOption}
              </option>
            ))}
          </select>
          {errors.state ? <p className={form.error}>{errors.state}</p> : null}
        </div>

        <section className={form.optional}>
          <button type="button" className={form.optionalBtn} onClick={() => setOptionalOpen((current) => !current)}>
            {optionalOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Opcionais
          </button>

          {optionalOpen ? (
            <div className={form.optionalContent}>
              <div className={form.row2}>
                <div className={form.field}>
                  <label className={form.label} htmlFor="order-cpf">
                    CPF
                  </label>
                  <input
                    id="order-cpf"
                    className={`${form.input} ${errors.cpf ? form.inputError : ""}`}
                    value={cpf}
                    onChange={(event) => setCpf(event.target.value)}
                  />
                  {errors.cpf ? <p className={form.error}>{errors.cpf}</p> : null}
                </div>

                <div className={form.field}>
                  <label className={form.label} htmlFor="order-complement">
                    Complemento
                  </label>
                  <input
                    id="order-complement"
                    className={form.input}
                    value={complement}
                    onChange={(event) => setComplement(event.target.value)}
                  />
                </div>
              </div>

              <div className={form.row2}>
                <div className={form.field}>
                  <label className={form.label} htmlFor="order-paymentMethod">
                    Forma de pagamento
                  </label>
                  <select
                    id="order-paymentMethod"
                    className={form.select}
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="debit_card">Cartão de Débito</option>
                    <option value="boleto">Boleto</option>
                  </select>
                </div>

                {paymentMethod === "credit_card" ? (
                  <div className={form.field}>
                    <label className={form.label} htmlFor="order-installments">
                      Parcelas
                    </label>
                    <select
                      id="order-installments"
                      className={form.select}
                      value={installments}
                      onChange={(event) => setInstallments(event.target.value)}
                    >
                      {Array.from({ length: 10 }).map((_, index) => {
                        const installment = index + 1;
                        return (
                          <option key={installment} value={String(installment)}>
                            {installment}x
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ) : null}
              </div>

              <div className={form.row2}>
                <div className={form.field}>
                  <label className={form.label} htmlFor="order-coupon">
                    Cupom
                  </label>
                  <input
                    id="order-coupon"
                    className={form.input}
                    value={coupon}
                    onChange={(event) => setCoupon(event.target.value)}
                  />
                </div>

                <div className={form.field}>
                  <label className={form.label} htmlFor="order-shippingMethod">
                    Método de frete
                  </label>
                  <select
                    id="order-shippingMethod"
                    className={form.select}
                    value={shippingMethod}
                    onChange={(event) => setShippingMethod(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    <option value="sedex">SEDEX</option>
                    <option value="pac">PAC</option>
                    <option value="carrier">Transportadora</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </Drawer>
  );
}

