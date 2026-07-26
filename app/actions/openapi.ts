"use server";

import { parseOpenApiJson } from "@/services/openapi";
import { ApiSpec } from "@/types";
import * as yaml from 'js-yaml';

const CANDIDATE_PATHS = [
    "/openapi.json",
    "/swagger.json",
    "/api-docs",
    "/api-docs.json",
    "/v1/openapi.json",
    "/api/openapi.json"
];

function isValidSpec(obj: any): boolean {
    return obj !== null && typeof obj === 'object' && ('openapi' in obj || 'swagger' in obj);
}

async function tryFetchAndParseSpec(targetUrl: string): Promise<any | null> {
    try {
        const response = await fetch(targetUrl, {
            next: { revalidate: 3600 }
        });

        if (!response.ok) {
            return null;
        }

        const text = await response.text();
        const trimmed = text.trim();
        const lowerUrl = targetUrl.toLowerCase();

        const isYaml = lowerUrl.endsWith('.yaml') || 
                       lowerUrl.endsWith('.yml') || 
                       trimmed.startsWith('openapi:') || 
                       trimmed.startsWith('swagger:');

        let parsed: any = null;

        if (isYaml) {
            try {
                parsed = yaml.load(text);
            } catch (e) {
                try {
                    parsed = JSON.parse(text);
                } catch {
                    return null;
                }
            }
        } else {
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                try {
                    parsed = yaml.load(text);
                } catch {
                    return null;
                }
            }
        }

        if (isValidSpec(parsed)) {
            return parsed;
        }
    } catch {
        return null;
    }
    return null;
}

async function getValidSpecObject(url: string): Promise<any> {
    // Try the direct URL first
    const directSpec = await tryFetchAndParseSpec(url);
    if (directSpec) {
        return directSpec;
    }

    // Try candidate paths by appending to base URL
    const baseUrl = url.replace(/\/+$/, '');
    for (const path of CANDIDATE_PATHS) {
        const candidateUrl = `${baseUrl}${path}`;
        const candidateSpec = await tryFetchAndParseSpec(candidateUrl);
        if (candidateSpec) {
            return candidateSpec;
        }
    }

    throw new Error("No OpenAPI spec found at this URL. Please paste the direct spec URL ending in .json or .yaml");
}

export async function fetchAndParseSpec(url: string): Promise<ApiSpec> {
    try {
        const specObj = await getValidSpecObject(url);
        return parseOpenApiJson(specObj);
    } catch (error: any) {
        throw new Error(error.message || "Failed to fetch and parse the API specification.");
    }
}

export async function fetchRawSpecJSON(url: string): Promise<string> {
    try {
        const specObj = await getValidSpecObject(url);
        return JSON.stringify(specObj, null, 2);
    } catch (error: any) {
        throw new Error(error.message || "Failed to fetch raw API specification.");
    }
}

