import clsx from "clsx";
import { Search } from "lucide-react";

/** Plain GET form: works without JavaScript and keeps the query in the URL for sharing. */
export function SearchForm({
  size = "large",
  defaultQuery = "",
  defaultCondition = "",
}: {
  size?: "large" | "compact";
  defaultQuery?: string;
  defaultCondition?: string;
}) {
  const large = size === "large";
  return (
    <form action="/search" method="get" role="search" className={clsx("w-full", large ? "space-y-3" : "flex flex-wrap gap-2")}>
      <div className={clsx("relative", large ? "" : "min-w-0 flex-[2_1_14rem]")}>
        <label htmlFor={`q-${size}`} className={large ? "mb-1 block font-semibold" : "sr-only"}>
          Drug, condition or mechanism
        </label>
        <Search aria-hidden className={clsx("pointer-events-none absolute left-3 text-muted", large ? "bottom-4 size-5" : "top-3 size-4")} />
        <input
          id={`q-${size}`}
          name="q"
          required
          defaultValue={defaultQuery}
          autoComplete="off"
          placeholder={large ? "e.g. metformin, polycystic ovary syndrome, GLP-1 agonist" : "Drug, condition or mechanism"}
          className={clsx(
            "w-full rounded-lg border border-[#cbbd9f] bg-surface pl-10 text-ink placeholder:text-[#6b6f78] focus:border-navy",
            large ? "py-3.5 pr-4 text-lg" : "py-2 pr-3",
          )}
        />
      </div>
      <div className={clsx(large ? "" : "min-w-0 flex-[1_1_10rem]")}>
        <label htmlFor={`condition-${size}`} className={large ? "mb-1 block font-semibold" : "sr-only"}>
          Patient&apos;s condition <span className="font-normal text-muted">(optional, used to check off-label use)</span>
        </label>
        <input
          id={`condition-${size}`}
          name="condition"
          defaultValue={defaultCondition}
          autoComplete="off"
          placeholder={large ? "e.g. polycystic ovary syndrome" : "Condition (optional)"}
          className={clsx(
            "w-full rounded-lg border border-[#cbbd9f] bg-surface px-3 text-ink placeholder:text-[#6b6f78] focus:border-navy",
            large ? "py-3" : "py-2",
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
