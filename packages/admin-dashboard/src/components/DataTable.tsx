"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  filterable?: boolean;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  pageSize?: number;
  currentPage?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (item: T) => void;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  searchValue?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  serverSide?: boolean;
}

type SortDirection = "asc" | "desc" | null;

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  pageSize = 50,
  currentPage = 1,
  totalItems,
  onPageChange,
  onRowClick,
  searchPlaceholder = "Search...",
  onSearch,
  searchValue,
  isLoading = false,
  emptyMessage = "No data found.",
  serverSide = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [localSearch, setLocalSearch] = useState("");
  const [localPage, setLocalPage] = useState(1);

  const search = searchValue ?? localSearch;
  const page = serverSide ? currentPage : localPage;
  const setPage = serverSide ? onPageChange : setLocalPage;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const processedData = useMemo(() => {
    if (serverSide) return data;

    let result = [...data];

    // Client-side search
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter((item) =>
        columns.some((col) => {
          const val = item[col.key];
          return val != null && String(val).toLowerCase().includes(lower);
        })
      );
    }

    // Client-side sort
    if (sortKey && sortDir) {
      result.sort((a, b) => {
        const aVal = a[sortKey] ?? "";
        const bVal = b[sortKey] ?? "";
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [data, search, sortKey, sortDir, columns, serverSide]);

  const total = serverSide ? (totalItems ?? data.length) : processedData.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginatedData = serverSide
    ? processedData
    : processedData.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ column }: { column: string }) => {
    if (sortKey !== column) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30" />;
    if (sortDir === "asc") return <ChevronUp className="h-3 w-3 ml-1" />;
    return <ChevronDown className="h-3 w-3 ml-1" />;
  };

  return (
    <div className="space-y-4">
      {(onSearch || !serverSide) && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                if (onSearch) onSearch(e.target.value);
                else setLocalSearch(e.target.value);
              }}
              className="pl-8"
            />
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "h-10 px-4 text-left align-middle font-medium text-muted-foreground",
                      col.sortable && "cursor-pointer select-none hover:text-foreground",
                      col.className
                    )}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center">
                      {col.header}
                      {col.sortable && <SortIcon column={col.key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="h-24 text-center">
                    <div className="flex items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="ml-2">Loading...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr
                    key={keyExtractor(item)}
                    className={cn(
                      "border-b transition-colors hover:bg-muted/50",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={() => onRowClick?.(item)}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn("p-4 align-middle", col.className)}>
                        {col.render ? col.render(item) : String(item[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} results
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage?.(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage?.(page + 1)}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
