# PTF Tahmin Performansı

Türkiye gün öncesi piyasası (GÖP) için geliştirdiğim saatlik **Piyasa Takas Fiyatı (PTF)** tahmin modellerinin geçmiş performansı.

🔗 **Canlı sayfa:** https://emiracar259-del.github.io/ptf-tahmin-performans/

Bu depo yalnızca sonuçları içerir: tarih, saat, gerçekleşen PTF ve modellerin o saat için ürettiği tahmin. Model kodu, değişkenler ve eğitim verisi ayrı ve kapalı bir depoda tutulur. Sayfada yalnızca fiyatı açıklanmış günler yer alır; gelecek günlerin tahmini yayınlanmaz.

## Sonuçlar (12 aylık walk-forward test, 01.10.2025 – 30.09.2026)

| Model | MAE (TL/MWh) | Naif tahmine göre |
|---|---:|---:|
| D+1 (naif: bilinen son günün fiyatını tekrarlar) | 506,7 | — |
| Model 1: geçmiş fiyat + takvim | 358,9 | −%29 |
| Model 3: + kendi talep, rüzgâr ve güneş tahminleri | 302,0 | −%40 |
| ANA: + barajlı üretim bilgisi ve tavan/taban sınıflandırıcısı | 294,7 | −%42 |
| YD3 | 284,6 | −%44 |
| ANA k6 nb | 283,6 | −%44 |
| YD3 nb | 282,0 | −%44 |
| **Ana model (ANA k6 nb + YD3 nb ortalaması)** | **280,9** | **−%45** |

MAE: saatlik ortalama mutlak hata. Model 14.10.2026'dan beri her gün otomatik olarak canlı çalışıyor.

## Tahmin kurgusu

- Model her gün **17.30'da** çalışır ve **D+2 gününün saatlik PTF tahminini** (24 saat, tek seferde) üretir. Örneğin 27 Ekim 17.30'da 29 Ekim'in tahmini yapılır.
- Test **walk-forward**'dur: model her gün yalnızca geçmiş veriyle yeniden eğitilir, ertesi tahmini üretir. Rastgele bölme kullanılmaz. Her değişken için "tahmin anında biliniyor muydu?" kuralı uygulanır.
- İyileşmeler Diebold-Mariano testiyle kontrol edilir; naif tahmin her zaman kıyas tabanıdır.

## Modellerin genel mantığı

- **Model 1 (ilk model):** Yalnızca tahmin anında bilinen geçmiş fiyatları, takvimi (saat, haftanın günü, ay), resmi tatil / arife / idari izin bilgisini ve o günün azami fiyatını (tavan) kullanır. Fiyatı doğrudan değil, tavana oranı olarak öğrenir; böylece tavan değiştiğinde de tutarlı kalır. LightGBM, XGBoost ve XGBoost-AFT'nin ortalamasıdır. Naif tahmine göre hatayı %29 azaltır; sonraki her model bunun üzerine kuruldu.
- **Model 3:** Model 1'e D+1 plan verileri ile kendi talep, rüzgâr ve güneş tahminlerimizden türetilen net yük eklendi. Model 1 ve Model 3'te sınıflandırıcı yoktur.

- **Alt modeller:** Talep, rüzgâr ve güneş üretimi için ayrı tahmin modelleri var. Bunların walk-forward tahminleri ana fiyat modeline girdi oluyor; böylece fiyat modeli alt modellerin hatalarını da öğreniyor.
- **ANA:** Fiyat modeli ve tavan/taban saatleri için ayrı bir sınıflandırıcıdan oluşan temel yapı. Sınıflandırıcı bir saatin tavana ya da 0 TL'ye vurma olasılığını verir; olasılık %50'yi geçerse o fiyat, geçmezse üç modelin ortalaması kullanılır. ANA ve sonraki bütün modeller bu sınıflandırıcıyı içerir. Sınıflandırıcının etkisi en net tavan saatlerinde görülür: 12 aylık testte gerçekleşen 1.005 tavan saatinden Model 3 200'ünü, ANA 714'ünü yakaladı. **k6** yenilenmiş alt modellerle çalışan sürümü.
- **YD3:** Arz tarafını ayrıca modelleyen yapı. ANA modeline kıyasla **barajlı üretimin yüksek olduğu günleri** daha iyi yakalar.
- **nb:** Fiyat ile yük arasındaki yakın geçmiş ilişkisinden ve GÖP teklif yapısından türetilen sinyallerin eklendiği sürüm.
- **Ana model:** ANA k6 nb ile YD3 nb'nin ortalaması. İki modelin hataları farklı günlerde yoğunlaştığı için ortalama ikisinden de daha iyi sonuç veriyor.

**Kullanılan yöntemler:** LightGBM, XGBoost, XGBoost-AFT (sansürlü regresyon, tavan/taban saatleri için), sınıflandırıcı + regresyon birleşimi, ensemble.

## Veri kaynakları

- [EPİAŞ Şeffaflık Platformu](https://seffaflik.epias.com.tr/): PTF ve piyasa verileri
- RİTM: rüzgâr ve güneş üretim verileri
- [Open-Meteo](https://open-meteo.com/): 81 il için geçmiş hava **tahminleri** (gerçekleşen hava değil, tahmin anında bilinen tahmin)

## Depo içeriği

| Dosya | İçerik |
|---|---|
| `index.html`, `assets/` | Performans sayfası (Chart.js) |
| `data/ptf.json` | 01.10.2025'ten bugüne saatlik gerçekleşen PTF ve model tahminleri |

`data/ptf.json` yapısı: `bas` ilk gün, `gun` gün sayısı, `seri.<model>` saatlik değerler (gün × 24, eksik saat `null`), `kaynak` her gün için `t` = walk-forward test, `g` = geriye dönük doldurma, `c` = canlı.

## Not

Bu sayfa bir model performans vitrinidir; yatırım veya ticaret tavsiyesi değildir.

---

Emirhan Acar · [LinkedIn](https://www.linkedin.com/in/emirhan-acar-87893a246)
