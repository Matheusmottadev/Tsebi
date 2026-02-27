"use client";

import { type FocusEvent, useMemo, useState } from "react";
import {
  describeSelectedSize,
  GLOBAL_SIZES,
  type GlobalSize,
  type ProductSizeModel,
  type RecommendSizeResult,
  recommendSize,
  storeSizeFinderAnswers,
  type SizeFinderAnswers,
} from "./SizeModel";
import styles from "./SizeFinderWizard.module.css";

type SizeFinderWizardProps = {
  productModel: ProductSizeModel;
  initialAnswers?: Partial<SizeFinderAnswers> | null;
  onApply: (result: RecommendSizeResult) => void;
};

type Step = 1 | 2 | 3;
type BodyRegion = "shoulders" | "chest" | "waist" | "hips" | "inseam";

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseNumberInput(value: string): number {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function clampIfFilled(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clampNumber(value, min, max);
}

function BodyGuide({ activeRegion }: { activeRegion: BodyRegion }) {
  return (
    <div className={styles.bodyGuideWrap} aria-hidden="true">
      <svg className={styles.bodyGuideSvg} viewBox="0 0 240 520" focusable="false">
        <path
          className={styles.mannequinStroke}
          d="M102 56
             C95 62, 95 70, 98 76
             C102 82, 102 90, 100 98
             M138 56
             C145 62, 145 70, 142 76
             C138 82, 138 90, 140 98
             M100 98
             C88 106, 82 122, 82 142
             L82 216
             C82 232, 78 246, 74 262
             C71 274, 70 290, 70 306
             L70 340
             C70 352, 64 360, 58 368
             C54 373, 55 381, 62 385
             C70 390, 80 388, 86 382
             C94 374, 98 364, 98 348
             L98 302
             C98 286, 102 270, 106 254
             L114 222
             L126 222
             L134 254
             C138 270, 142 286, 142 302
             L142 348
             C142 364, 146 374, 154 382
             C160 388, 170 390, 178 385
             C185 381, 186 373, 182 368
             C176 360, 170 352, 170 340
             L170 306
             C170 290, 169 274, 166 262
             C162 246, 158 232, 158 216
             L158 142
             C158 122, 152 106, 140 98"
        />
        <path className={styles.mannequinStroke} d="M108 174 C112 182, 128 182, 132 174" />
        <path className={styles.mannequinStroke} d="M106 214 C110 222, 130 222, 134 214" />
        <path className={styles.mannequinStroke} d="M96 170 C92 192, 86 220, 88 248" />
        <path className={styles.mannequinStroke} d="M144 170 C148 192, 154 220, 152 248" />
        <path className={styles.mannequinStroke} d="M110 222 C106 246, 102 272, 102 300 C102 322, 104 340, 106 356" />
        <path className={styles.mannequinStroke} d="M130 222 C134 246, 138 272, 138 300 C138 322, 136 340, 134 356" />

        <line
          id="measure-shoulder"
          className={`${styles.guideLine} ${activeRegion === "shoulders" ? styles.guideLineActive : ""}`}
          x1="84"
          y1="150"
          x2="156"
          y2="150"
        />
        <line
          id="measure-chest"
          className={`${styles.guideLine} ${activeRegion === "chest" ? styles.guideLineActive : ""}`}
          x1="82"
          y1="185"
          x2="158"
          y2="185"
        />
        <line
          id="measure-waist"
          className={`${styles.guideLine} ${activeRegion === "waist" ? styles.guideLineActive : ""}`}
          x1="80"
          y1="230"
          x2="160"
          y2="230"
        />
        <line
          id="measure-hip"
          className={`${styles.guideLine} ${activeRegion === "hips" ? styles.guideLineActive : ""}`}
          x1="76"
          y1="270"
          x2="164"
          y2="270"
        />
        <line
          id="measure-center"
          className={`${styles.guideLine} ${styles.guideCenter} ${activeRegion === "inseam" ? styles.guideLineActive : ""}`}
          x1="120"
          y1="270"
          x2="120"
          y2="356"
        />
      </svg>
    </div>
  );
}

function ScaleInput({
  label,
  value,
  onChange,
  onActivate,
  onDeactivate,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  onActivate?: () => void;
  onDeactivate?: () => void;
}) {
  const points = [1, 2, 3, 4, 5, 6, 7];
  return (
    <div
      className={styles.scaleField}
      onMouseEnter={onActivate}
      onFocusCapture={onActivate}
      onBlurCapture={(event: FocusEvent<HTMLDivElement>) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        onDeactivate?.();
      }}
    >
      <div className={styles.scaleLabelRow}>
        <span>{label}</span>
        <div className={styles.scaleButtons}>
          <button type="button" onClick={() => onChange(clampNumber(value - 1, 1, 7))} aria-label={`${label} menos`}>
            -
          </button>
          <button type="button" onClick={() => onChange(clampNumber(value + 1, 1, 7))} aria-label={`${label} mais`}>
            +
          </button>
        </div>
      </div>
      <div className={styles.scaleDots} role="group" aria-label={label}>
        {points.map((point) => (
          <button
            type="button"
            key={point}
            onClick={() => onChange(point)}
            className={point === value ? styles.dotActive : styles.dot}
            aria-label={`${label} nivel ${point}`}
          />
        ))}
      </div>
    </div>
  );
}

export function SizeFinderWizard({ productModel, initialAnswers, onApply }: SizeFinderWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [heightUnit, setHeightUnit] = useState<"cm" | "pes">("cm");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [braBand, setBraBand] = useState("Faixa");
  const [braCup, setBraCup] = useState("Taca");
  const [ethnicity, setEthnicity] = useState("");
  const [activeRegion, setActiveRegion] = useState<BodyRegion>("shoulders");
  const [answers, setAnswers] = useState<SizeFinderAnswers>({
    gender: initialAnswers?.gender === "HOMEM" ? "HOMEM" : "MULHER",
    heightCm: 0,
    weightKg: 0,
    note: String(initialAnswers?.note || ""),
    shoulders: clampNumber(Number(initialAnswers?.shoulders || 4), 1, 7),
    chest: clampNumber(Number(initialAnswers?.chest || 4), 1, 7),
    waist: clampNumber(Number(initialAnswers?.waist || 4), 1, 7),
    hips: clampNumber(Number(initialAnswers?.hips || 4), 1, 7),
    inseam: clampNumber(Number(initialAnswers?.inseam || 4), 1, 7),
  });

  const result = useMemo(() => recommendSize(answers, productModel), [answers, productModel]);
  const [manualSize, setManualSize] = useState<GlobalSize | null>(null);
  const highlightedSize = manualSize || result.recommendedSize;
  const displayedResult = useMemo(() => describeSelectedSize(result, highlightedSize), [result, highlightedSize]);
  const sizeIndex = GLOBAL_SIZES.indexOf(highlightedSize);

  const canContinueStep1 = answers.heightCm >= 140 && answers.weightKg >= 35;

  const goNext = () => setStep((current) => (current < 3 ? ((current + 1) as Step) : current));
  const goPrev = () => setStep((current) => (current > 1 ? ((current - 1) as Step) : current));

  const apply = () => {
    storeSizeFinderAnswers(answers);
    onApply(displayedResult);
  };

  const selectPrevSize = () => {
    if (sizeIndex <= 0) return;
    setManualSize(GLOBAL_SIZES[sizeIndex - 1]);
  };

  const selectNextSize = () => {
    if (sizeIndex < 0 || sizeIndex >= GLOBAL_SIZES.length - 1) return;
    setManualSize(GLOBAL_SIZES[sizeIndex + 1]);
  };

  return (
    <div className={styles.root}>
      <div className={styles.progress}>
        <span
          className={`${step >= 1 ? styles.progressOn : ""} ${step === 1 ? styles.progressCurrent : ""}`}
          aria-label="Passo 1"
        />
        <span
          className={`${step >= 2 ? styles.progressOn : ""} ${step === 2 ? styles.progressCurrent : ""}`}
          aria-label="Passo 2"
        />
        <span
          className={`${step >= 3 ? styles.progressOn : ""} ${step === 3 ? styles.progressCurrent : ""}`}
          aria-label="Passo 3"
        />
      </div>

      {step === 1 ? (
        <section className={styles.section}>
          <h3>Fale sobre Você</h3>
          <p className={styles.subtitle}>Fale sobre Você, para que possamos recomendar o tamanho certo</p>
          <div className={styles.tabs}>
            <button
              type="button"
              className={answers.gender === "MULHER" ? styles.tabActive : ""}
              onClick={() => setAnswers((current) => ({ ...current, gender: "MULHER" }))}
            >
              MULHER
            </button>
            <button
              type="button"
              className={answers.gender === "HOMEM" ? styles.tabActive : ""}
              onClick={() => setAnswers((current) => ({ ...current, gender: "HOMEM" }))}
            >
              HOMEM
            </button>
          </div>
          <div className={styles.stepOneFields}>
            <label className={styles.inputGroup}>
              <div className={styles.inlineInput}>
                <input
                  type="number"
                  min={140}
                  max={220}
                  value={answers.heightCm > 0 ? answers.heightCm : ""}
                  placeholder="Altura"
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      heightCm: parseNumberInput(event.target.value),
                    }))
                  }
                  onBlur={() =>
                    setAnswers((current) => ({
                      ...current,
                      heightCm: clampIfFilled(current.heightCm, 140, 220),
                    }))
                  }
                />
                <div className={styles.unitSwitch}>
                  <button
                    type="button"
                    className={heightUnit === "cm" ? styles.unitOn : ""}
                    onClick={() => setHeightUnit("cm")}
                  >
                    cm
                  </button>
                  <button
                    type="button"
                    className={heightUnit === "pes" ? styles.unitOn : ""}
                    onClick={() => setHeightUnit("pes")}
                  >
                    pes
                  </button>
                </div>
              </div>
              <span className={styles.required}>Campo obrigatorio</span>
            </label>

            <label className={styles.inputGroup}>
              <div className={styles.inlineInput}>
                <input
                  type="number"
                  min={35}
                  max={180}
                  value={answers.weightKg > 0 ? answers.weightKg : ""}
                  placeholder="Peso"
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      weightKg: parseNumberInput(event.target.value),
                    }))
                  }
                  onBlur={() =>
                    setAnswers((current) => ({
                      ...current,
                      weightKg: clampIfFilled(current.weightKg, 35, 180),
                    }))
                  }
                />
                <div className={styles.unitSwitch}>
                  <button
                    type="button"
                    className={weightUnit === "kg" ? styles.unitOn : ""}
                    onClick={() => setWeightUnit("kg")}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    className={weightUnit === "lb" ? styles.unitOn : ""}
                    onClick={() => setWeightUnit("lb")}
                  >
                    lb
                  </button>
                </div>
              </div>
              <span className={styles.required}>Campo obrigatorio</span>
            </label>

            {answers.gender === "MULHER" ? (
              <div className={styles.formStack}>
                <span className={styles.stackLabel}>Tamanho de sutia</span>
                <div className={styles.selectRow}>
                  <select defaultValue="IT" aria-label="Padrao de sutia">
                    <option value="IT">IT</option>
                    <option value="BR">BR</option>
                  </select>
                  <select value={braBand} onChange={(event) => setBraBand(event.target.value)} aria-label="Faixa">
                    <option>Faixa</option>
                    <option>38</option>
                    <option>40</option>
                    <option>42</option>
                    <option>44</option>
                  </select>
                  <select value={braCup} onChange={(event) => setBraCup(event.target.value)} aria-label="Taca">
                    <option>Taca</option>
                    <option>A</option>
                    <option>B</option>
                    <option>C</option>
                    <option>D</option>
                  </select>
                </div>
              </div>
            ) : null}

            <label className={styles.ethnicityField}>
              <span>Etnia</span>
              <div className={styles.ethnicityInput}>
                <input
                  type="text"
                  value={ethnicity}
                  onChange={(event) => setEthnicity(event.target.value)}
                  placeholder="Etnia"
                />
                <span aria-hidden="true">i</span>
              </div>
            </label>

            <button
              type="button"
              className={styles.clearLink}
              onClick={() => {
                setAnswers((current) => ({
                  ...current,
                  heightCm: 0,
                  weightKg: 0,
                  note: "",
                }));
                setEthnicity("");
                setBraBand("Faixa");
                setBraCup("Taca");
              }}
            >
              Apagar os dados
            </button>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={goNext} disabled={!canContinueStep1}>
              CONTINUAR
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={styles.section}>
          <h3>Forma do corpo</h3>
          <BodyGuide activeRegion={activeRegion} />
          <ScaleInput
            label="Ombros"
            value={answers.shoulders}
            onChange={(next) => setAnswers((current) => ({ ...current, shoulders: next }))}
            onActivate={() => setActiveRegion("shoulders")}
          />
          <ScaleInput
            label="Peito"
            value={answers.chest}
            onChange={(next) => setAnswers((current) => ({ ...current, chest: next }))}
            onActivate={() => setActiveRegion("chest")}
          />
          <ScaleInput
            label="Cintura"
            value={answers.waist}
            onChange={(next) => setAnswers((current) => ({ ...current, waist: next }))}
            onActivate={() => setActiveRegion("waist")}
          />
          <ScaleInput
            label="Quadris"
            value={answers.hips}
            onChange={(next) => setAnswers((current) => ({ ...current, hips: next }))}
            onActivate={() => setActiveRegion("hips")}
          />
          <ScaleInput
            label="Comprimento da perna"
            value={answers.inseam}
            onChange={(next) => setAnswers((current) => ({ ...current, inseam: next }))}
            onActivate={() => setActiveRegion("inseam")}
          />
          <div className={styles.actionsDual}>
            <button type="button" className={styles.secondary} onClick={goPrev}>
              VOLTAR
            </button>
            <button type="button" className={styles.primary} onClick={goNext}>
              CONTINUAR
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={styles.section}>
          <h3>Seu tamanho recomendado e:</h3>
          <p className={styles.recommendedSize}>{displayedResult.recommendedSize}</p>
          <p className={styles.fitLabel}>{displayedResult.fitLabel}</p>
          <p className={styles.confidence}>Confianca: {displayedResult.confidence}</p>

          <div className={styles.horizontalSizes} aria-label="Lista de tamanhos">
            <button
              type="button"
              className={styles.arrowButton}
              aria-label="Tamanho anterior"
              onClick={selectPrevSize}
              disabled={sizeIndex <= 0}
            >
              &#8249;
            </button>
            <div className={styles.sizeRail}>
              {GLOBAL_SIZES.map((size) => (
                <button
                  type="button"
                  key={size}
                  className={size === highlightedSize ? styles.sizeSelected : styles.sizeOption}
                  onClick={() => setManualSize(size)}
                  aria-label={`Selecionar tamanho ${size}`}
                >
                  {size}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.arrowButton}
              aria-label="Proximo tamanho"
              onClick={selectNextSize}
              disabled={sizeIndex >= GLOBAL_SIZES.length - 1}
            >
              &#8250;
            </button>
          </div>

          <div className={styles.actionsDual}>
            <button type="button" className={styles.secondary} onClick={goPrev}>
              VOLTAR
            </button>
            <button type="button" className={styles.primary} onClick={apply}>
              APLICAR TAMANHO
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

