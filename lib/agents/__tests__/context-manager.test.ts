/**
 * Tests for Context Manager
 */

import { estimateTokenCount, calculateContextTokens } from '../context-manager';
import type { ConversationMessage } from '../agentic-workflow';

describe('Context Manager', () => {
  describe('estimateTokenCount', () => {
    it('should estimate tokens correctly', () => {
      const text = 'Hello world! This is a test.';
      const tokens = estimateTokenCount(text);
      
      // Rough estimate: ~7 tokens for this text (28 chars / 4)
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });

    it('should handle large text', () => {
      const largeText = 'a'.repeat(400000); // 400k characters
      const tokens = estimateTokenCount(largeText);
      
      // Should be ~100k tokens
      expect(tokens).toBeCloseTo(100000, -4);
    });

    it('should handle JSON objects', () => {
      const obj = {
        user: 'admin',
        action: 'login',
        ip: '192.168.1.1',
        timestamp: '2025-11-17T10:00:00Z',
      };
      
      const tokens = estimateTokenCount(JSON.stringify(obj));
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('calculateContextTokens', () => {
    it('should calculate total tokens across all inputs', () => {
      const alertData = {
        title: 'Suspicious Login',
        severity: 'high',
        description: 'Multiple failed login attempts detected',
      };

      const findings = {
        agent1: { summary: 'Found 5 suspicious IPs' },
        agent2: { summary: 'Detected brute force pattern' },
      };

      const agentFindings = [
        { iteration: 1, query: 'index=auth failed', results: [] },
        { iteration: 2, analysis: 'No findings' },
      ];

      const conversationHistory: ConversationMessage[] = [
        {
          role: 'orchestrator',
          content: 'Starting investigation',
          timestamp: new Date(),
        },
        {
          role: 'agent',
          agent_name: 'auth_investigator',
          content: 'Completed analysis',
          timestamp: new Date(),
        },
      ];

      const total = calculateContextTokens(
        alertData,
        findings,
        agentFindings,
        conversationHistory
      );

      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThan(1000); // Should be reasonable for small test data
    });

    it('should detect large context', () => {
      const alertData = { title: 'Test Alert' };
      
      // Create large findings (simulate 100 queries with 100 logs each)
      const findings = {};
      for (let i = 0; i < 5; i++) {
        (findings as any)[`agent${i}`] = {
          queries: Array(20).fill({ results: Array(100).fill({ log: 'x'.repeat(200) }) }),
        };
      }

      const agentFindings = Array(50).fill({
        query: 'index=*',
        results: Array(100).fill({ log: 'a'.repeat(200) }),
      });

      const conversationHistory: ConversationMessage[] = [];

      const total = calculateContextTokens(
        alertData,
        findings,
        agentFindings,
        conversationHistory
      );

      // Should be very large (>100k tokens)
      expect(total).toBeGreaterThan(100000);
    });
  });

  describe('Token Thresholds', () => {
    it('should identify when summarization is needed', () => {
      const THRESHOLD = 90000;
      
      // Simulate context that exceeds threshold
      const largeContext = 'x'.repeat(400000); // ~100k tokens
      const tokens = estimateTokenCount(largeContext);

      const needsSummarization = tokens > THRESHOLD;
      expect(needsSummarization).toBe(true);
    });

    it('should identify safe context size', () => {
      const THRESHOLD = 90000;
      
      // Simulate small context
      const smallContext = JSON.stringify({
        alert: 'test',
        findings: { agent1: 'summary' },
      });
      
      const tokens = estimateTokenCount(smallContext);

      const needsSummarization = tokens > THRESHOLD;
      expect(needsSummarization).toBe(false);
    });
  });
});
