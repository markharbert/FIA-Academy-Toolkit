import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Type, 
  Download, 
  Plus, 
  Trash2, 
  Palette,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Bold,
  Italic,
  Shapes,
  ArrowBigUp,
  ArrowBigRight,
  Star,
  Circle,
  Square,
  Triangle,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Check,
  X,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Heart,
  Play
} from "lucide-react";

interface TextLayer {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  bold: boolean;
  italic: boolean;
  rotation: number;
}

interface ShapeLayer {
  id: string;
  type: "shape";
  shape: string;
  x: number;
  y: number;
  size: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  rotation: number;
}

type Layer = TextLayer | ShapeLayer;

const shapeIcons = [
  { name: "arrow_up", label: "Arrow Up", path: "M12 19V6M5 12l7-7 7 7" },
  { name: "arrow_right", label: "Arrow Right", path: "M5 12h14M12 5l7 7-7 7" },
  { name: "arrow_diagonal", label: "Arrow Diagonal", path: "M7 17L17 7M17 7H7M17 7v10" },
  { name: "star", label: "Star", path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  { name: "circle", label: "Circle", path: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" },
  { name: "check", label: "Checkmark", path: "M20 6L9 17l-5-5" },
  { name: "x", label: "X Mark", path: "M18 6L6 18M6 6l12 12" },
  { name: "thumbs_up", label: "Thumbs Up", path: "M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" },
  { name: "thumbs_down", label: "Thumbs Down", path: "M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" },
  { name: "dollar", label: "Dollar Sign", path: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { name: "trending_up", label: "Trending Up", path: "m23 6-9.5 9.5-5-5L1 18M17 6h6v6" },
  { name: "trending_down", label: "Trending Down", path: "m23 18-9.5-9.5-5 5L1 6M17 18h6v-6" },
  { name: "heart", label: "Heart", path: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" },
  { name: "play", label: "Play Button", path: "M5 3l14 9-14 9V3z" },
  { name: "zap", label: "Lightning", path: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
  { name: "alert", label: "Warning", path: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" },
];

interface ThumbnailEditorProps {
  baseImage: string;
  width: number;
  height: number;
  onSave?: (dataUrl: string) => void;
  onClose?: () => void;
}

const fontFamilies = [
  { value: "Impact", label: "Impact (YouTube Classic)" },
  { value: "Arial Black", label: "Arial Black" },
  { value: "Bebas Neue", label: "Bebas Neue" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Oswald", label: "Oswald" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
];

const presetColors = [
  "#FFFFFF", "#000000", "#FF0000", "#FFFF00", "#00FF00", 
  "#00FFFF", "#0000FF", "#FF00FF", "#FF6B00", "#FFD700"
];

const gradientBackgrounds = [
  { name: "Blue to Purple", value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  { name: "Orange to Red", value: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
  { name: "Green to Teal", value: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" },
  { name: "Yellow to Orange", value: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)" },
  { name: "Purple to Pink", value: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)" },
  { name: "Dark Blue", value: "linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)" },
];

export function ThumbnailEditor({ baseImage, width, height, onSave, onClose }: ThumbnailEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [backgroundGradient, setBackgroundGradient] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setLoadedImage(img);
    };
    img.src = baseImage;
  }, [baseImage]);

  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const newScale = Math.min(1, (containerWidth - 40) / width);
      setScale(newScale);
    }
  }, [width]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (backgroundGradient) {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        const match = backgroundGradient.match(/linear-gradient\((\d+)deg,\s*([^,]+)\s*0%,\s*([^)]+)\s*100%\)/);
        if (match) {
          const angle = parseInt(match[1]);
          const color1 = match[2].trim();
          const color2 = match[3].trim();
          const radians = (angle - 90) * Math.PI / 180;
          const x1 = width / 2 - Math.cos(radians) * width;
          const y1 = height / 2 - Math.sin(radians) * height;
          const x2 = width / 2 + Math.cos(radians) * width;
          const y2 = height / 2 + Math.sin(radians) * height;
          const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
          gradient.addColorStop(0, color1);
          gradient.addColorStop(1, color2);
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);
        }
      }
    }

    if (loadedImage) {
      const imgAspect = loadedImage.width / loadedImage.height;
      const canvasAspect = width / height;
      let drawWidth, drawHeight, drawX, drawY;
      
      if (imgAspect > canvasAspect) {
        drawHeight = height;
        drawWidth = height * imgAspect;
        drawX = (width - drawWidth) / 2;
        drawY = 0;
      } else {
        drawWidth = width;
        drawHeight = width / imgAspect;
        drawX = 0;
        drawY = (height - drawHeight) / 2;
      }
      
      ctx.drawImage(loadedImage, drawX, drawY, drawWidth, drawHeight);
    }

    layers.forEach(layer => {
      ctx.save();
      ctx.translate(layer.x, layer.y);
      ctx.rotate(layer.rotation * Math.PI / 180);

      if (layer.type === "text") {
        let fontStyle = "";
        if (layer.italic) fontStyle += "italic ";
        if (layer.bold) fontStyle += "bold ";
        ctx.font = `${fontStyle}${layer.fontSize}px ${layer.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        if (layer.strokeWidth > 0) {
          ctx.strokeStyle = layer.strokeColor;
          ctx.lineWidth = layer.strokeWidth;
          ctx.lineJoin = "round";
          ctx.miterLimit = 2;
          ctx.strokeText(layer.text, 0, 0);
        }
        
        ctx.fillStyle = layer.color;
        ctx.fillText(layer.text, 0, 0);
        
        if (selectedLayerId === layer.id) {
          const metrics = ctx.measureText(layer.text);
          const textWidth = metrics.width;
          const textHeight = layer.fontSize;
          ctx.strokeStyle = "#00BFFF";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(-textWidth / 2 - 10, -textHeight / 2 - 5, textWidth + 20, textHeight + 10);
          ctx.setLineDash([]);
        }
      } else if (layer.type === "shape") {
        const shapeInfo = shapeIcons.find(s => s.name === layer.shape);
        if (shapeInfo) {
          const scaleFactor = layer.size / 24;
          ctx.scale(scaleFactor, scaleFactor);
          
          const path = new Path2D(shapeInfo.path);
          ctx.translate(-12, -12);
          
          if (layer.strokeWidth > 0) {
            ctx.strokeStyle = layer.strokeColor;
            ctx.lineWidth = layer.strokeWidth / scaleFactor;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke(path);
          }
          
          ctx.fillStyle = layer.color;
          ctx.fill(path);
          
          if (selectedLayerId === layer.id) {
            ctx.strokeStyle = "#00BFFF";
            ctx.lineWidth = 2 / scaleFactor;
            ctx.setLineDash([5 / scaleFactor, 5 / scaleFactor]);
            ctx.strokeRect(-5, -5, 34, 34);
            ctx.setLineDash([]);
          }
        }
      }
      
      ctx.restore();
    });
  }, [loadedImage, layers, selectedLayerId, width, height, backgroundGradient]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const addTextLayer = () => {
    const newLayer: TextLayer = {
      id: `text-${Date.now()}`,
      type: "text",
      text: "YOUR TEXT",
      x: width / 2,
      y: height / 2,
      fontSize: 72,
      fontFamily: "Impact",
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 4,
      bold: true,
      italic: false,
      rotation: 0,
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const addShapeLayer = (shapeName: string) => {
    const newLayer: ShapeLayer = {
      id: `shape-${Date.now()}`,
      type: "shape",
      shape: shapeName,
      x: width / 2,
      y: height / 2,
      size: 80,
      color: "#00FF00",
      strokeColor: "#000000",
      strokeWidth: 3,
      rotation: 0,
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const updateLayer = (id: string, updates: Partial<Layer>) => {
    setLayers(currentLayers => currentLayers.map(l => l.id === id ? { ...l, ...updates } as Layer : l));
  };

  const deleteLayer = (id: string) => {
    setLayers(currentLayers => currentLayers.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const moveLayerUp = (id: string) => {
    const index = layers.findIndex(l => l.id === id);
    if (index < layers.length - 1) {
      const newLayers = [...layers];
      [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
      setLayers(newLayers);
    }
  };

  const moveLayerDown = (id: string) => {
    const index = layers.findIndex(l => l.id === id);
    if (index > 0) {
      const newLayers = [...layers];
      [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
      setLayers(newLayers);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      let halfW: number, halfH: number;
      
      if (layer.type === "text") {
        const canvas2d = canvas.getContext("2d");
        if (!canvas2d) continue;
        canvas2d.font = `${layer.bold ? "bold " : ""}${layer.fontSize}px ${layer.fontFamily}`;
        const metrics = canvas2d.measureText(layer.text);
        halfW = metrics.width / 2 + 10;
        halfH = layer.fontSize / 2 + 5;
      } else {
        halfW = layer.size / 2 + 10;
        halfH = layer.size / 2 + 10;
      }
      
      if (x >= layer.x - halfW && x <= layer.x + halfW &&
          y >= layer.y - halfH && y <= layer.y + halfH) {
        setSelectedLayerId(layer.id);
        setIsDragging(true);
        setDragOffset({ x: x - layer.x, y: y - layer.y });
        return;
      }
    }
    
    setSelectedLayerId(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !selectedLayerId) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    updateLayer(selectedLayerId, { x: x - dragOffset.x, y: y - dragOffset.y });
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSelectedLayerId(null);
    
    setTimeout(() => {
      const dataUrl = canvas.toDataURL("image/png");
      if (onSave) {
        onSave(dataUrl);
      } else {
        const link = document.createElement("a");
        link.download = "thumbnail.png";
        link.href = dataUrl;
        link.click();
      }
    }, 100);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      <div ref={containerRef} className="flex-1 flex flex-col items-center justify-center bg-muted/30 rounded-lg p-4">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ 
            width: width * scale, 
            height: height * scale,
            cursor: isDragging ? "grabbing" : "default"
          }}
          className="border shadow-lg rounded"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          data-testid="canvas-editor"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Click text to select, drag to move
        </p>
      </div>

      <div className="w-full lg:w-80 space-y-4">
        <div className="flex gap-2">
          <Button onClick={addTextLayer} className="flex-1" data-testid="button-add-text">
            <Plus className="h-4 w-4 mr-2" />
            Add Text
          </Button>
          <Button onClick={handleExport} variant="outline" data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        <Tabs defaultValue="layers" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="layers" data-testid="tab-layers-controls">
              <Type className="h-4 w-4 mr-2" />
              Layers
            </TabsTrigger>
            <TabsTrigger value="shapes" data-testid="tab-shapes-controls">
              <Shapes className="h-4 w-4 mr-2" />
              Icons
            </TabsTrigger>
            <TabsTrigger value="background" data-testid="tab-background-controls">
              <Palette className="h-4 w-4 mr-2" />
              Background
            </TabsTrigger>
          </TabsList>

          <TabsContent value="layers" className="space-y-4">
            {layers.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-muted-foreground">
                  <Type className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No layers yet</p>
                  <p className="text-sm">Click "Add Text" or add icons from the Icons tab</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {layers.map((layer, index) => (
                  <Card 
                    key={layer.id}
                    className={`cursor-pointer transition-colors ${selectedLayerId === layer.id ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelectedLayerId(layer.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-medium truncate flex-1">
                          {layer.type === "text" ? (layer.text || "Empty text") : `Icon: ${layer.shape}`}
                        </span>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); moveLayerUp(layer.id); }} disabled={index === layers.length - 1}>
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); moveLayerDown(layer.id); }} disabled={index === 0}>
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} data-testid={`button-delete-layer-${layer.id}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {selectedLayerId === layer.id && layer.type === "text" && (
                        <div className="space-y-3 pt-2 border-t">
                          <div>
                            <Label className="text-xs">Text</Label>
                            <Input
                              value={layer.text}
                              onChange={(e) => updateLayer(layer.id, { text: e.target.value })}
                              placeholder="Enter text"
                              data-testid="input-layer-text"
                            />
                          </div>
                          
                          <div>
                            <Label className="text-xs">Font</Label>
                            <Select value={layer.fontFamily} onValueChange={(v) => updateLayer(layer.id, { fontFamily: v })}>
                              <SelectTrigger data-testid="select-font">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {fontFamilies.map(f => (
                                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-xs">Size: {layer.fontSize}px</Label>
                            <Slider
                              value={[layer.fontSize]}
                              onValueChange={([v]) => updateLayer(layer.id, { fontSize: v })}
                              min={24}
                              max={200}
                              step={1}
                              data-testid="slider-font-size"
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={layer.bold ? "default" : "outline"}
                              onClick={() => updateLayer(layer.id, { bold: !layer.bold })}
                              data-testid="button-bold"
                            >
                              <Bold className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant={layer.italic ? "default" : "outline"}
                              onClick={() => updateLayer(layer.id, { italic: !layer.italic })}
                              data-testid="button-italic"
                            >
                              <Italic className="h-4 w-4" />
                            </Button>
                          </div>

                          <div>
                            <Label className="text-xs">Text Color</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {presetColors.map(color => (
                                <button
                                  key={color}
                                  className={`w-6 h-6 rounded border-2 ${layer.color === color ? "border-primary" : "border-transparent"}`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => updateLayer(layer.id, { color })}
                                  data-testid={`button-color-${color}`}
                                />
                              ))}
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs">Stroke Color</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {presetColors.map(color => (
                                <button
                                  key={color}
                                  className={`w-6 h-6 rounded border-2 ${layer.strokeColor === color ? "border-primary" : "border-transparent"}`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => updateLayer(layer.id, { strokeColor: color })}
                                  data-testid={`button-stroke-color-${color}`}
                                />
                              ))}
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs">Stroke Width: {layer.strokeWidth}px</Label>
                            <Slider
                              value={[layer.strokeWidth]}
                              onValueChange={([v]) => updateLayer(layer.id, { strokeWidth: v })}
                              min={0}
                              max={20}
                              step={1}
                              data-testid="slider-stroke-width"
                            />
                          </div>

                          <div>
                            <Label className="text-xs">Rotation: {layer.rotation}°</Label>
                            <div className="flex gap-2 items-center">
                              <Slider
                                value={[layer.rotation]}
                                onValueChange={([v]) => updateLayer(layer.id, { rotation: v })}
                                min={-45}
                                max={45}
                                step={1}
                                className="flex-1"
                                data-testid="slider-rotation"
                              />
                              <Button size="icon" variant="ghost" onClick={() => updateLayer(layer.id, { rotation: 0 })}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {selectedLayerId === layer.id && layer.type === "shape" && (
                        <div className="space-y-3 pt-2 border-t">
                          <div>
                            <Label className="text-xs">Size: {layer.size}px</Label>
                            <Slider
                              value={[layer.size]}
                              onValueChange={([v]) => updateLayer(layer.id, { size: v })}
                              min={24}
                              max={300}
                              step={1}
                              data-testid="slider-shape-size"
                            />
                          </div>

                          <div>
                            <Label className="text-xs">Color</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {presetColors.map(color => (
                                <button
                                  key={color}
                                  className={`w-6 h-6 rounded border-2 ${layer.color === color ? "border-primary" : "border-transparent"}`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => updateLayer(layer.id, { color })}
                                />
                              ))}
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs">Stroke Color</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {presetColors.map(color => (
                                <button
                                  key={color}
                                  className={`w-6 h-6 rounded border-2 ${layer.strokeColor === color ? "border-primary" : "border-transparent"}`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => updateLayer(layer.id, { strokeColor: color })}
                                />
                              ))}
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs">Stroke Width: {layer.strokeWidth}px</Label>
                            <Slider
                              value={[layer.strokeWidth]}
                              onValueChange={([v]) => updateLayer(layer.id, { strokeWidth: v })}
                              min={0}
                              max={10}
                              step={1}
                            />
                          </div>

                          <div>
                            <Label className="text-xs">Rotation: {layer.rotation}°</Label>
                            <div className="flex gap-2 items-center">
                              <Slider
                                value={[layer.rotation]}
                                onValueChange={([v]) => updateLayer(layer.id, { rotation: v })}
                                min={-180}
                                max={180}
                                step={1}
                                className="flex-1"
                              />
                              <Button size="icon" variant="ghost" onClick={() => updateLayer(layer.id, { rotation: 0 })}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="shapes" className="space-y-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Click to add an icon</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {shapeIcons.map(shape => (
                    <button
                      key={shape.name}
                      className="h-12 w-12 flex items-center justify-center rounded-md border hover:bg-accent transition-colors"
                      onClick={() => addShapeLayer(shape.name)}
                      title={shape.label}
                      data-testid={`button-add-shape-${shape.name}`}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={shape.path} />
                      </svg>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="background" className="space-y-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Gradient Backgrounds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {gradientBackgrounds.map(bg => (
                    <button
                      key={bg.name}
                      className={`h-12 rounded-md border-2 transition-colors ${backgroundGradient === bg.value ? "border-primary" : "border-transparent"}`}
                      style={{ background: bg.value }}
                      onClick={() => setBackgroundGradient(bg.value)}
                      title={bg.name}
                      data-testid={`button-gradient-${bg.name}`}
                    />
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => setBackgroundGradient(null)}
                  data-testid="button-clear-background"
                >
                  Clear Background
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {onClose && (
          <Button variant="outline" onClick={onClose} className="w-full" data-testid="button-close-editor">
            Close Editor
          </Button>
        )}
      </div>
    </div>
  );
}
