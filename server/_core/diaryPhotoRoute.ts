import type { Express, Request, Response } from "express";
import { readDiaryPhoto } from "./diaryStorage";
import { authenticateClientRequest } from "./clientAuth";
import { authenticateFieldRequest } from "./fieldAuth";
import { sdk } from "./sdk";
import { rawQuery } from "../db";
import { isProjectInExecution } from "../routers/siteDiary";

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/**
 * Serve uma foto do Diário de Obras, checando permissão antes: só o dono
 * interno do projeto (equipe) ou um client_user com acesso àquele projeto
 * (clients.id == projects.clientId) podem ver. Fotos nunca são públicas —
 * por isso não dá pra usar express.static direto no diretório do volume.
 */
export function registerSiteDiaryPhotoRoute(app: Express) {
  app.get("/api/site-diary/photos/:fileName", async (req: Request, res: Response) => {
    const { fileName } = req.params;

    try {
      const rows = await rawQuery(
        `SELECT p.id as projectId, p.userId as ownerUserId, p.clientId as projectClientId
         FROM site_diary_photos sdp
         JOIN site_diary_entries sde ON sde.id = sdp.diaryEntryId
         JOIN projects p ON p.id = sde.projectId
         WHERE sdp.fileName = ? LIMIT 1`,
        [fileName]
      );
      const row = rows[0];
      if (!row) {
        res.status(404).send("Foto não encontrada");
        return;
      }

      // Diário só vale para obra em execução — fotos de obra fora de execução ficam indisponíveis.
      if (!(await isProjectInExecution(row.projectId))) {
        res.status(403).send("O Diário de Obras só está disponível para obras em execução.");
        return;
      }

      let authorized = false;

      try {
        const user = await sdk.authenticateRequest(req);
        if (user && user.id === row.ownerUserId) authorized = true;
      } catch {
        // sem sessão interna válida — tenta sessão de cliente abaixo
      }

      if (!authorized) {
        const clientUser = await authenticateClientRequest(req);
        if (clientUser && row.projectClientId && clientUser.clientId === row.projectClientId) {
          authorized = true;
        }
      }

      if (!authorized) {
        // Login de campo: só vê fotos da própria obra.
        const fieldUser = await authenticateFieldRequest(req);
        if (fieldUser && fieldUser.projectId === row.projectId) {
          authorized = true;
        }
      }

      if (!authorized) {
        res.status(403).send("Sem permissão para ver esta foto");
        return;
      }

      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      const buffer = await readDiaryPhoto(fileName);
      res.setHeader("Content-Type", EXT_TO_CONTENT_TYPE[ext] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(buffer);
    } catch (error) {
      console.error("[SiteDiary] Falha ao servir foto", error);
      res.status(500).send("Erro ao carregar foto");
    }
  });
}
