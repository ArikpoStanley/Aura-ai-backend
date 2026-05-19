import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

type ReplicatePrediction = {
  id: string;
  status:
    | 'starting'
    | 'processing'
    | 'succeeded'
    | 'failed'
    | 'canceled'
    | 'aborted';
  output?: string | string[] | null;
  error?: string | null;
};

@Injectable()
export class ReplicateService {
  private readonly baseUrl = 'https://api.replicate.com/v1';
  private readonly token: string;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.getOrThrow<string>('REPLICATE_API_TOKEN');
  }

  async runModel(params: {
    model: string;
    input: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<{ predictionId: string; outputUrls: string[] }> {
    const [owner, name] = params.model.split('/');
    if (!owner || !name) {
      throw new BadGatewayException(
        'Replicate model must be in owner/name format',
      );
    }

    const create = await axios.post<ReplicatePrediction>(
      `${this.baseUrl}/models/${owner}/${name}/predictions`,
      { input: params.input },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const predictionId = create.data.id;
    const timeoutMs = params.timeoutMs ?? 180_000;
    const pollIntervalMs = Number(
      this.config.get<string>('REPLICATE_POLL_INTERVAL_MS', '1000'),
    );
    const pollMs =
      Number.isFinite(pollIntervalMs) && pollIntervalMs >= 500
        ? pollIntervalMs
        : 1000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const poll = await axios.get<ReplicatePrediction>(
        `${this.baseUrl}/predictions/${predictionId}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        },
      );

      if (poll.data.status === 'succeeded') {
        const output = poll.data.output;
        const outputUrls = Array.isArray(output)
          ? output.filter((item): item is string => typeof item === 'string')
          : typeof output === 'string'
            ? [output]
            : [];
        return { predictionId, outputUrls };
      }

      if (
        poll.data.status === 'failed' ||
        poll.data.status === 'canceled' ||
        poll.data.status === 'aborted'
      ) {
        throw new BadGatewayException(
          poll.data.error ?? `Replicate prediction ${poll.data.status}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    throw new GatewayTimeoutException('Replicate prediction timed out');
  }
}
