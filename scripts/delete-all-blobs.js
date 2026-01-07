#!/usr/bin/env node

/**
 * Delete all Netlify Blobs
 * 
 * This script deletes all blobs from the Netlify Blob store.
 * Use with caution - this will delete ALL blobs!
 */

const NETLIFY_ACCESS_TOKEN = 'nfp_cAeX57LtHYvjjErkwFRaRXMmEKkMQb8Va1a9';
const NETLIFY_SITE_ID = '355c7c56-9205-43f4-87a5-0294233016ed';

async function listAllBlobs(storeName) {
  const url = `https://api.netlify.com/api/v1/blobs/${NETLIFY_SITE_ID}/${storeName}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list blobs: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.blobs || [];
}

async function deleteBlob(storeName, key) {
  const url = `https://api.netlify.com/api/v1/blobs/${NETLIFY_SITE_ID}/${storeName}/${encodeURIComponent(key)}`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete blob ${key}: ${response.status} ${response.statusText}`);
  }

  return true;
}

async function deleteAllBlobs() {
  const stores = ['projects', 'assets'];
  
  console.log('🗑️  Starting blob deletion process...\n');

  for (const storeName of stores) {
    console.log(`📦 Processing store: ${storeName}`);
    
    try {
      const blobs = await listAllBlobs(storeName);
      console.log(`   Found ${blobs.length} blobs`);

      if (blobs.length === 0) {
        console.log(`   ✅ No blobs to delete\n`);
        continue;
      }

      for (const blob of blobs) {
        try {
          await deleteBlob(storeName, blob.key);
          console.log(`   ✅ Deleted: ${blob.key}`);
        } catch (error) {
          console.error(`   ❌ Failed to delete ${blob.key}:`, error.message);
        }
      }

      console.log(`   ✅ Completed ${storeName}\n`);
    } catch (error) {
      console.error(`   ❌ Error processing ${storeName}:`, error.message, '\n');
    }
  }

  console.log('✅ Blob deletion complete!');
}

deleteAllBlobs().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

