import "dotenv/config";
// scripts/runBackgroundTasks.mjs
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { extractTextFromPDFBuffer } from "./pdfExtractor.mjs";
import mammoth from "mammoth";
import fs from "fs";

// Configuration
const CHUNK_SIZE = 2000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOperation(operation, operationName, maxRetries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`âš ï¸ ${operationName} attempt ${attempt} failed:`, error.message);
      if (attempt < maxRetries) {
        await delay(RETRY_DELAY * attempt);
      }
    }
  }
  throw lastError;
}

function chunkText(text, chunkSize = CHUNK_SIZE) {
  if (!text || text.length === 0) {
    return [];
  }
  
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function loadDependencies() {
  try {
    // Load dependencies with retry logic
    const { default: s3Client } = await import("../src/lib/s3.mjs");
    const { prisma } = await import("../src/lib/prisma.mjs");
    const { 
      generateEmbeddingsInBackground, 
      runSummarizationInBackground 
    } = await import("../src/utils/backgroundTasks.js");

    return { s3Client, prisma, generateEmbeddingsInBackground, runSummarizationInBackground };
  } catch (error) {
    console.error("âŒ Failed to load dependencies:", error);
    throw new Error(`Dependency loading failed: ${error.message}`);
  }
}

async function updateDocumentStatus(prisma, docId, status, error = null) {
  if (error) {
    console.error(`Document ${docId} status ${status}:`, error);
  }

  return retryOperation(
    async () => {
      return await prisma.document.update({
        where: { id: docId },
        data: { status },
      });
    },
    `Update document status to ${status}`
  );
}

async function downloadFromS3(s3Client, s3Key) {
  return retryOperation(
    async () => {
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
      });
      const response = await s3Client.send(command);
      return await streamToBuffer(response.Body);
    },
    "S3 download"
  );
}

async function processDocument(docId, s3Key, filename) {
  let failed = false;
  console.log(`ðŸš€ Worker started for doc ${docId}, file: ${filename}`);
  
  let dependencies;
  try {
    // Load all dependencies first
    dependencies = await loadDependencies();
    const { prisma } = dependencies;

    // Update status to extracting
    const claim = await prisma.document.updateMany({
      where: {
        id: docId,
        status: "queued",
      },
      data: {
        status: "extracting",
      },
    });

    if (claim.count !== 1) {
      console.log(`Skipping document ${docId}: already claimed or not queued`);
      return;
    }

    // Download file from S3
    console.log(`ðŸ“¥ Downloading file from S3: ${s3Key}`);
    const buffer = await downloadFromS3(dependencies.s3Client, s3Key);
    
    if (!buffer || buffer.length === 0) {
      throw new Error("Downloaded file is empty");
    }

    console.log(`âœ… Downloaded ${buffer.length} bytes`);

    // Extract text based on file type
    let text = "";
    if (filename.endsWith(".txt")) {
      text = buffer.toString("utf-8");
    } else if (filename.endsWith(".pdf")) {
      console.log("ðŸ“„ Processing PDF file...");
      text = await extractTextFromPDFBuffer(buffer);
    } else if (filename.endsWith(".docx")) {
      console.log("ðŸ“„ Processing DOCX file...");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      throw new Error(`Unsupported file type: ${filename}`);
    }

    if (!text || text.trim().length === 0) {
      throw new Error("No text content extracted from file");
    }

    console.log(`âœ… Extracted ${text.length} characters from ${filename}`);

    // Chunk text
    const chunks = chunkText(text);
    console.log(`ðŸ“¦ Created ${chunks.length} chunks`);

    // Insert chunks into DB
    await retryOperation(
      async () => {
        await prisma.chunk.createMany({
          data: chunks.map((chunk, idx) => ({
            documentId: docId,
            chunkIndex: idx,
            text: chunk,
          })),
        });
      },
      "Create chunks in database"
    );

    // Update document with content and status
    await updateDocumentStatus(prisma, docId, "processing");

    // Run background AI tasks sequentially to avoid overload
    console.log(`ðŸ¤– Starting AI tasks for document ${docId}`);
    
    if (dependencies.generateEmbeddingsInBackground) {
      await dependencies.generateEmbeddingsInBackground(docId, chunks);
    } else {
      throw new Error("Embedding function not available");
    }

    if (dependencies.runSummarizationInBackground) {
      await dependencies.runSummarizationInBackground(docId, filename, chunks);
    } else {
      throw new Error("Summarization function not available");
    }

    // Both AI tasks must succeed before marking ingestion complete.
    // Preserve the existing document processing-status contract.
    await updateDocumentStatus(prisma, docId, "completed");
    
    console.log(`ðŸŽ‰ Processing complete for doc ${docId}`);

  } catch (error) {
    failed = true;
    console.error("âŒ Worker failed:", error);
    
    try {
      if (dependencies?.prisma) {
        await updateDocumentStatus(dependencies.prisma, docId, "error", error);
      }
    } catch (dbError) {
      console.error("âŒ Failed to update error status:", dbError);
    }
  } finally {
    // Allow pending I/O and logging to finish.
    process.exitCode = failed ? 1 : 0;
  }
}

// Handle command line arguments (fallback)
if (process.argv.length >= 5) {
  const docId = process.argv[2];
  const s3Key = process.argv[3];
  const filename = process.argv[4];
  
  console.log(`ðŸ“ Starting via CLI args for doc: ${docId}`);
  processDocument(docId, s3Key, filename).catch(console.error);
}

// Handle IPC messages (primary)
process.on("message", async (message) => {
  if (message && message.docId && message.s3Key && message.filename) {
    console.log(`ðŸ“ Starting via IPC for doc: ${message.docId}`);
    await processDocument(message.docId, message.s3Key, message.filename);
  } else {
    console.error("âŒ Invalid IPC message:", message);
    process.exit(1);
  }
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("ðŸ’¥ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("ðŸ’¥ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});