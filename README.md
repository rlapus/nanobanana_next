# nanobanana_next
=======
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Local Qwen (ComfyUI) runtime

To use a local Qwen Image model with this app, run a local ComfyUI server and
point the app to `http://localhost:8188`.

Example (adjust paths to your model and LoRA, then launch ComfyUI):

```bash
python main.py --listen 0.0.0.0 --port 8188
```

Then verify the server is reachable:

```bash
curl http://localhost:8188
```

Optional environment overrides (defaults shown):

```bash
COMFYUI_BASE_URL=http://localhost:8188
COMFYUI_WORKFLOW_T2I=/absolute/path/to/txt2img.json
COMFYUI_WORKFLOW_I2I=/absolute/path/to/img2img.json
COMFYUI_MODEL_NAME=qwen-image.safetensors
COMFYUI_CLIP_NAME=qwen_2.5_vl_7b_fp8_scaled.safetensors
COMFYUI_CLIP_TYPE=qwen_image
COMFYUI_VAE_NAME=qwen_image_vae.safetensors
```

## OpenAI GPT Image 1.5

To use OpenAI image generation, set:

```bash
OPENAI_API_KEY=your_key_here
```

## OpenRouter Seedream 4.5

To use Seedream 4.5 via OpenRouter, set:

```bash
OPENROUTER_API_KEY=your_key_here
OPENROUTER_IMAGE_MODEL=bytedance-seed/seedream-4.5
```

Once the server is running, select the Qwen ComfyUI option in the UI. The app
will send text-to-image and image-to-image requests to ComfyUI using the
workflow templates in `comfyui/workflows/`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
