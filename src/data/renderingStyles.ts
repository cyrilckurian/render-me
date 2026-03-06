import photorealistic from "@/assets/styles/photorealistic.jpg";
import sketch from "@/assets/styles/sketch.jpg";
import watercolor from "@/assets/styles/watercolor.jpg";
import ink from "@/assets/styles/ink.jpg";
import marker from "@/assets/styles/marker.jpg";
import inverted from "@/assets/styles/inverted.jpg";
import monochromatic from "@/assets/styles/monochromatic.jpg";
import collage from "@/assets/styles/collage.jpg";

export interface RenderingStyle {
  id: string;
  name: string;
  description: string;
  prompt: string;
  image: string;
}

export const renderingStyles: RenderingStyle[] = [
  {
    id: "photorealistic",
    name: "Photorealistic",
    description: "Ultra-realistic 3D rendering with natural lighting",
    prompt: "Render this floor plan as a photorealistic 3D visualization with warm natural lighting, realistic materials, detailed textures, and accurate furniture placement. For any staircases, render them so that one side of the steps faces downward toward the lower floor and the opposite side faces upward toward the upper floor — never render steps going in both directions simultaneously.",
    image: photorealistic.src,
  },
  {
    id: "marker",
    name: "Marker",
    description: "Bold Copic marker rendering",
    prompt: "Render this floor plan in bold Copic marker style with vibrant colors, clean color blocks, and a professional architectural presentation look.",
    image: marker.src,
  },
  {
    id: "monochromatic",
    name: "Monochromatic",
    description: "Minimalist grayscale rendering",
    prompt: "Render this floor plan in a monochromatic grayscale style with clean lines, minimalist design, and elegant tonal gradation.",
    image: monochromatic.src,
  },
  {
    id: "sketch",
    name: "Sketch",
    description: "Hand-drawn pencil sketch style",
    prompt: "Transform this floor plan into a detailed hand-drawn pencil sketch with cross-hatching, shading, and visible pencil strokes on white graph paper, in the style of an architectural design sketch.",
    image: sketch.src,
  },
  {
    id: "ink",
    name: "Ink",
    description: "Precise black ink illustration",
    prompt: "Convert this floor plan into a precise black ink illustration with detailed line work, hatching technique, and high contrast on white background.",
    image: ink.src,
  },
  {
    id: "collage",
    name: "Collage",
    description: "Mixed media cut-paper collage",
    prompt: "Transform this floor plan into a mixed media collage with layered cut paper textures, magazine cutouts, and artistic material combinations.",
    image: collage.src,
  },
  {
    id: "watercolor",
    name: "Watercolor",
    description: "Soft watercolor painting with fluid washes",
    prompt: "Render this floor plan as a beautiful watercolor painting with soft washes of color, fluid brushstrokes, and warm earth tones blending naturally.",
    image: watercolor.src,
  },
  {
    id: "inverted",
    name: "Inverted",
    description: "Dark background with gold-highlighted walls",
    prompt: "Render this floor plan in an inverted dark style with a near-black background, gold/amber highlighted walls and structural elements, deep green room fills, and crisp white labels — inspired by high-end architectural presentation drawings.",
    image: inverted.src,
  },
];
