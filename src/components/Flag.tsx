import * as React from "react";
import { useTranslation } from "react-i18next";

interface FlagProps {
  flag?: string | null;
  size?: string; // Tailwind spacing units (e.g. "6" = 1.5rem).
  decorative?: boolean; // The region is already shown as adjacent text.
}

const fallbackCode = "UN";
const regionalIndicatorStart = 0x1f1e6;

// Two-letter SVG basenames in public/assets/flags. Files in public are not Vite modules.
const regionCodes = new Set(
  (
    "AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI" +
    " " +
    "BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO" +
    " " +
    "CP CR CU CV CW CX CY CZ DE DG DJ DK DM DO DZ EA EC EE EG EH ER ES ET EU FI" +
    " " +
    "FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK" +
    " " +
    "HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM" +
    " " +
    "KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK" +
    " " +
    "ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR" +
    " " +
    "NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB" +
    " " +
    "SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH" +
    " " +
    "TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM UN US UY UZ VA VC VE VG VI VN VU" +
    " " +
    "WF WS XK YE YT ZA ZM ZW"
  ).split(" "),
);

export function getFlagRegionCode(flag?: string | null): string | null {
  const region = typeof flag === "string" ? flag.trim() : "";
  if (/^[a-z]{2}$/i.test(region)) {
    const code = region.toUpperCase();
    return regionCodes.has(code) ? code : null;
  }

  const indicators = Array.from(region);
  if (indicators.length !== 2) return null;
  const offsets = indicators.map(
    (indicator) => indicator.codePointAt(0)! - regionalIndicatorStart,
  );
  if (!offsets.every((offset) => offset >= 0 && offset < 26)) return null;
  const code = String.fromCharCode(...offsets.map((offset) => 65 + offset));
  return regionCodes.has(code) ? code : null;
}

const Flag = React.memo(({ flag, size = "6", decorative }: FlagProps) => {
  const { t } = useTranslation();
  const code = getFlagRegionCode(flag) ?? fallbackCode;
  const [failedCode, setFailedCode] = React.useState<string>();
  const asset = failedCode === code ? fallbackCode : code;
  const units = Number(size);
  const width = Number.isFinite(units) && units > 0 ? units / 4 : 1.5;

  return (
    <img
      className="km-flag"
      src={`/assets/flags/${asset}.svg`}
      alt={
        decorative
          ? ""
          : t("common.region_flag_alt", {
              name:
                typeof flag === "string"
                  ? flag.trim() || fallbackCode
                  : fallbackCode,
            })
      }
      onError={asset === fallbackCode ? undefined : () => setFailedCode(code)}
      style={{
        display: "block",
        width: `var(--km-flag-width, ${width}rem)`,
        height: `var(--km-flag-height, ${width}rem)`,
        objectFit: "contain",
        flexShrink: 0,
        margin: 0,
      }}
    />
  );
});

Flag.displayName = "Flag";

export default Flag;
