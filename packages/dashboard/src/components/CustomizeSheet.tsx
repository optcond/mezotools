import type { DragEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface DashboardWidget<WidgetKey extends string> {
  key: WidgetKey;
  label: string;
}

interface CustomizeSheetProps<WidgetKey extends string> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: DashboardWidget<WidgetKey>[];
  widgetOrder: WidgetKey[];
  widgetVisibility: Record<WidgetKey, boolean>;
  draggingWidget: WidgetKey | null;
  onToggleWidget: (key: WidgetKey) => void;
  onMoveWidgetByOffset: (key: WidgetKey, offset: number) => void;
  onDragStart: (key: WidgetKey) => (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (key: WidgetKey) => (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (key: WidgetKey) => (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

export const CustomizeSheet = <WidgetKey extends string>({
  open,
  onOpenChange,
  widgets,
  widgetOrder,
  widgetVisibility,
  draggingWidget,
  onToggleWidget,
  onMoveWidgetByOffset,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: CustomizeSheetProps<WidgetKey>) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="right"
      className="flex h-full w-full flex-col gap-4 overflow-y-auto sm:max-w-md"
      enableSwipeClose
      onSwipeClose={() => onOpenChange(false)}
    >
      <SheetHeader>
        <SheetTitle>Customize dashboard</SheetTitle>
        <SheetDescription>
          Pick the widgets you want to keep on screen and drag to reorder. On
          mobile, use the arrows.
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4">
        {widgetOrder.map((key, index) => {
          const widget = widgets.find((item) => item.key === key);
          if (!widget) {
            return null;
          }
          const isDragging = draggingWidget === key;
          const isFirst = index === 0;
          const isLast = index === widgetOrder.length - 1;
          return (
            <div
              key={widget.key}
              draggable
              onDragStart={onDragStart(widget.key)}
              onDragOver={onDragOver(widget.key)}
              onDrop={onDrop(widget.key)}
              onDragEnd={onDragEnd}
              className={`flex items-center justify-between gap-4 rounded-xl border border-card-border/60 bg-card/40 px-4 py-3 transition ${
                isDragging ? "opacity-70 ring-1 ring-primary/40" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <Label
                  htmlFor={`widget-${widget.key}`}
                  className="text-sm font-medium text-foreground"
                >
                  {widget.label}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 sm:hidden">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => onMoveWidgetByOffset(widget.key, -1)}
                    disabled={isFirst}
                    aria-label="Move widget up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => onMoveWidgetByOffset(widget.key, 1)}
                    disabled={isLast}
                    aria-label="Move widget down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
                <Checkbox
                  id={`widget-${widget.key}`}
                  checked={widgetVisibility[widget.key]}
                  onCheckedChange={() => onToggleWidget(widget.key)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SheetContent>
  </Sheet>
);
