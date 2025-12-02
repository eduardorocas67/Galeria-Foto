import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import type { Photo } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class PhotoService {
  public photos: UserPhoto[] = [];

  private PHOTO_STORAGE: string = 'photos';

  private platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  public async addNewToGallery() {
    // Tomar una foto
    const capturedPhoto = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 100,
    });

    const savedImageFile = await this.savePicture(capturedPhoto);

    this.photos.unshift(savedImageFile);

    Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos),
    });
  }

  private async savePicture(photo: Photo) {
    let base64Data: string | Blob;

    // LECTURA: Diferenciar entre Hybrid (móvil) y Web
    if (this.platform.is('hybrid')) {
      // MÓVIL: Leer el archivo directamente desde el path
      const file = await Filesystem.readFile({
        path: photo.path!,
      });
      base64Data = file.data;
    } else {
      // WEB: Fetch la foto, leer como blob, y convertir a Base64
      const response = await fetch(photo.webPath!);
      const blob = await response.blob();
      base64Data = (await this.convertBlobToBase64(blob)) as string;
    }

    // 1. Escribir el archivo en el directorio de datos (persistencia)
    const fileName = Date.now() + '.jpeg';
    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Data,
    });

    // 2. RETORNO: Diferenciar entre Hybrid (móvil) y Web
    if (this.platform.is('hybrid')) {
      // MÓVIL: Usamos savedFile.uri para persistencia y convertFileSrc para visualización
      return {
        filepath: savedFile.uri,
        webviewPath: Capacitor.convertFileSrc(savedFile.uri),
      };
    } else {
      // WEB: Guardamos el nombre del archivo para persistencia (fileName) y usamos el webPath temporal para visualización
      return {
        filepath: fileName,
        webviewPath: photo.webPath,
      };
    }
  }

  private convertBlobToBase64(blob: Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });
  }

  public async loadSaved() {
    // Retrieve cached photo array data
    const { value: photoList } = await Preferences.get({ key: this.PHOTO_STORAGE });
    this.photos = (photoList ? JSON.parse(photoList) : []) as UserPhoto[];

    // If running on the web...
    if (!this.platform.is('hybrid')) {
      for (let photo of this.photos) {
        const readFile = await Filesystem.readFile({
          path: photo.filepath,
          directory: Directory.Data,
        });
        // Web platform only: Load the photo as base64 data
        photo.webviewPath = `data:image/jpeg;base64,${readFile.data}`;
      }
    }
    // En móvil, las rutas guardadas (filepath) ya son URIs completas, por lo que no se requiere más lógica aquí.
  }

  public async deletePhoto(photo: UserPhoto, position: number) {
    // 1. Eliminar esta foto del array de datos
    this.photos.splice(position, 1);

    // 2. Actualizar la caché de fotos
    Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos),
    });

    // 3. Eliminar el archivo de la foto del sistema de archivos
    // Obtenemos el nombre del archivo de la ruta, asumiendo que el nombre es la última parte
    // Usamos el filepath (que es la URI completa en móvil) para encontrar el nombre del archivo.
    const filename = photo.filepath.slice(photo.filepath.lastIndexOf('/') + 1);

    await Filesystem.deleteFile({
      path: filename,
      directory: Directory.Data,
    });
  }
}

export interface UserPhoto {
  filepath: string;
  webviewPath?: string;
}