import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const agentsDirectory = path.join(process.cwd(), 'agents'); 
    
    // Read all files in the directory
    const files = await fs.readdir(agentsDirectory);

    // Filter to only include .yaml or .yml files
    const yamlFiles = files.filter((file) => 
      file.endsWith('.yaml') || file.endsWith('.yml')
    );

    // Read the contents of each file
    const agents = await Promise.all(
      yamlFiles.map(async (fileName) => {
        const filePath = path.join(agentsDirectory, fileName);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        
        return {
          fileName,
          content: fileContent,
        };
      })
    );

    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error reading agent files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' }, 
      { status: 500 }
    );
  }
}