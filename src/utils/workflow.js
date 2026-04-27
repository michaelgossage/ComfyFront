// Flux workflow matching the worker-comfyui hub template structure
export function buildWorkflow({ prompt, steps, guidance, seed, width, height, checkpoint }) {
  return {
    "30": {
      "class_type": "CheckpointLoaderSimple",
      "_meta": { "title": "Load Checkpoint" },
      "inputs": { "ckpt_name": checkpoint }
    },
    "6": {
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Positive Prompt)" },
      "inputs": { "text": prompt, "clip": ["30", 1] }
    },
    "33": {
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Negative Prompt)" },
      "inputs": { "text": "", "clip": ["30", 1] }
    },
    "35": {
      "class_type": "FluxGuidance",
      "_meta": { "title": "FluxGuidance" },
      "inputs": { "guidance": guidance, "conditioning": ["6", 0] }
    },
    "27": {
      "class_type": "EmptySD3LatentImage",
      "_meta": { "title": "EmptySD3LatentImage" },
      "inputs": { "width": width, "height": height, "batch_size": 1 }
    },
    "31": {
      "class_type": "KSampler",
      "_meta": { "title": "KSampler" },
      "inputs": {
        "seed": seed,
        "steps": steps,
        "cfg": 1,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 1,
        "model": ["30", 0],
        "positive": ["35", 0],
        "negative": ["33", 0],
        "latent_image": ["27", 0]
      }
    },
    "8": {
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" },
      "inputs": { "samples": ["31", 0], "vae": ["30", 2] }
    },
    "9": {
      "class_type": "SaveImage",
      "_meta": { "title": "Save Image" },
      "inputs": { "filename_prefix": "ComfyFront", "images": ["8", 0] }
    }
  }
}
