import clsx from "clsx";
import { Search } from "lucide-react";
import { AutocompleteInput } from "./autocomplete-input";

/**
 * One search box for a drug, a condition, a drug class, or a drug and condition together ("metformin for PCOS").
 * A GET form, so it works without JavaScript and keeps the query in the URL for sharing.
 */
export function SearchForm({ size = "large", defaultQuery = "" }: { size?: "large" | "compact"; defaultQuery?: string }) {
  const large = size === "large";
  return (
    <form action="/search" method="get" role="search" className={clsx("w-full", large ? "space-y-3" : "flex flex-wrap gap-2")}>
      <div className={clsx("relative", large ? "" : "min-w-0 flex-[1_1_16rem]")}>
        <label htmlFor={`q-${size}`} className={large ? "mb-1 block font-semibold" : "sr-only"}>
          Drug, condition, or both <span className="font-normal text-muted">(e.g. &ldquo;metformin for PCOS&rdquo;)</span>
        </label>
        <Search aria-hidden className={clsx("pointer-events-none absolute left-3 z-10 text-muted", large ? "bottom-4 size-5" : "top-3 size-4")} />
        <AutocompleteInput
          id={`q-${size}`}
          name="q"
          kinds={["drug", "condition", "class", "pair"]}
          required
          defaultValue={defaultQuery}
          placeholder={large ? "e.g. metformin, polycystic ovary syndrome, metformin for PCOS" : "Drug, condition, or both"}
          className={clsx(
            "w-full rounded-lg border border-[#cbbd9f] bg-surface pl-10 text-ink placeholder:text-[#6b6f78] focus:border-navy",
            large ? "py-3.5 pr-4 text-lg" : "py-2 pr-3",
          )}
        />
      </div>
      <button
        type="submit"
        className={clsx(
          "rounded-lg bg-navy font-semibold text-cream hover:bg-navy-hover",
          large ? "w-full py-3.5 text-lg sm:w-auto sm:px-10" : "px-4 py-2",
        )}
      >
        Search
      </button>
    </form>
  );
}
