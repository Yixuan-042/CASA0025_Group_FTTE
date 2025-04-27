//================= Layer 1: CO₂ emission heatmap =================//

var years = [2017, 2018, 2019, 2020, 2021, 2022, 2023];
var co2Paths = {
  2017: 'users/HuitingChen/2017co2',
  2018: 'users/HuitingChen/2018co2',
  2019: 'users/HuitingChen/2019co2',
  2020: 'users/HuitingChen/2020co2',
  2021: 'users/HuitingChen/2021co2',
  2022: 'users/HuitingChen/2022co2',
  2023: 'users/HuitingChen/2023co2' 
};

var visParams = {
  min: 0,
  max: 600,
  palette: ['#440154', '#3b528b', '#21908d', '#5dc962', '#fde725']
};

var co2Images = {};
var avgList = {};

// 加载 co2 影像，统一处理
years.forEach(function(year) {
  var img = ee.Image(co2Paths[year]);
  co2Images[year] = img;

  var mean = img.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: img.geometry(),
    scale: 1000,
    maxPixels: 1e13
  }).getNumber('b1');

  avgList[year] = mean;
});

// 默认加载 2023年
var defaultYear = 2023;
var activeImage = co2Images[defaultYear];
Map.addLayer(activeImage, visParams, 'CO₂ ' + defaultYear);

// UI控件

// 年份选择器
var yearSelector = ui.Select({
  items: years.map(String),
  value: String(defaultYear),
  style: {
    width: '100%',
    fontWeight: 'bold',
    fontSize: '14px',
    textAlign: 'center',
    margin: '0 auto',
    backgroundColor: 'rgba(0,0,0,0)'
  }
});

// 年份区域
var yearSection = ui.Panel({
  widgets: [
    ui.Label('Choose year', {
      fontWeight: 'bold',
      fontSize: '16px',
      textAlign: 'center',
      margin: '0 0 4px 0',
      backgroundColor: 'rgba(0,0,0,0)'
    }),
    yearSelector
  ],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {margin: '0 0 8px 0', backgroundColor: 'rgba(0,0,0,0)'}
});

// 折线图
var lineChart = ui.Chart.array.values({
  array: ee.Array(years.map(function(year) { return [avgList[year]]; })),
  axis: 0,
  xLabels: years
})
.setChartType('LineChart')
.setOptions({
  title: 'Average CO₂ Emission Trend',
  hAxis: {
    ticks: years,
    textStyle: {fontSize: 11},
    format: '####'
  },
  vAxis: {title: 'Average CO₂'},
  legend: {position: 'none'},
  lineWidth: 3,
  pointSize: 5,
  fontSize: 13,
  chartArea: {width: '85%', height: '70%'},
  series: {
    0: {label: 'Mean'}
  }
});
var lineChartPanel = ui.Panel([lineChart]);

// 区县柱状图 panel
var districtChartPanel = ui.Panel();
districtChartPanel.style().set('shown', false);

// 切换按钮
var buttonLineChart = ui.Button({
  label: 'City Avg Trend',
  style: {stretch: 'horizontal', fontWeight: 'bold', margin: '0 4px 0 0'},
  onClick: function() {
    lineChartPanel.style().set('shown', true);
    districtChartPanel.style().set('shown', false);
  }
});
var buttonBarChart = ui.Button({
  label: 'District CO₂ Distribution',
  style: {stretch: 'horizontal', fontWeight: 'bold', margin: '0 0 0 4px'},
  onClick: function() {
    lineChartPanel.style().set('shown', false);
    districtChartPanel.style().set('shown', true);
  }
});
var chartButtonPanel = ui.Panel({
  widgets: [buttonLineChart, buttonBarChart],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {margin: '8px 0', backgroundColor: 'rgba(0,0,0,0)'}
});

// 色带图例
var makeColorBar = function(palette) {
  return ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0).multiply(visParams.max / 100).toByte(),
    params: {bbox: [0, 0, 100, 10], dimensions: '256x20', format: 'png', palette: palette},
    style: {stretch: 'horizontal', maxHeight: '24px', margin: '4px 0'}
  });
};
var legend = ui.Panel([
  ui.Label('CO₂ emission intensity (unit)', {
    fontWeight: 'bold', textAlign: 'center', margin: '0 0 6px 0', backgroundColor: 'rgba(0,0,0,0)'
  }),
  makeColorBar(visParams.palette),
  ui.Panel(
    [0, 150, 300, 450, 600].map(function(val) {
      return ui.Label(val.toString(), {stretch: 'horizontal', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0)'});
    }),
    ui.Panel.Layout.flow('horizontal')
  )
]);

// 右侧面板
var rightPanel = ui.Panel({
  widgets: [yearSection, chartButtonPanel, lineChartPanel, districtChartPanel, legend],
  style: {
    position: 'top-right',
    width: '360px',
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.9)',
    border: '1px solid #ccc',
    borderRadius: '10px'
  },
  layout: ui.Panel.Layout.flow('vertical')
});
Map.add(rightPanel);

// 年份切换逻辑
yearSelector.onChange(function(yearStr) {
  var year = parseInt(yearStr);
  var img = co2Images[year];
  Map.layers().set(0, ui.Map.Layer(img, visParams, 'CO₂ ' + year));
  activeImage = img;
  if (typeof updateDistrictChart === 'function') {
    updateDistrictChart(year);
  }
});

// 区县数据
var districts = ee.FeatureCollection('users/HuitingChen/GZ_boundaries');

// 生成区县柱状图
function makeDistrictChart(year) {
  var co2 = co2Images[year];
  return ui.Chart.image.byRegion(
    co2,
    districts,
    ee.Reducer.sum(),
    1000,
    'ENG_NAME'
  )
  .setChartType('ColumnChart')
  .setOptions({
    title: 'District-wise Total CO₂ Emission - ' + year,
    hAxis: {slantedText: true},
    vAxis: {title: 'Total CO₂'},
    legend: {position: 'none'},
    fontSize: 12
  });
}

// 年份变化时更新柱状图
function updateDistrictChart(year) {
  var newChart = makeDistrictChart(year);
  districtChartPanel.clear();
  districtChartPanel.add(newChart);
}

// 加载初始柱状图
updateDistrictChart(defaultYear);


//================= Layer 2: GuangZhou Boundaries =================//

var districtStyle = {
  color: 'white',
  width: 1.2,
  fillColor: '00000000'
};
var districtLayer = ui.Map.Layer(districts.style(districtStyle), {}, 'District Boundaries', true);
Map.layers().add(districtLayer);

//================= Layer 3: Landcover Map + Pie Chart =================//

var esa = ee.ImageCollection('ESA/WorldCover/v100')
             .first()
             .select('Map')
             .clip(districts);

var landsat9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
  .filterBounds(districts)
  .filterDate('2023-01-01', '2023-12-31')
  .filter(ee.Filter.lt('CLOUD_COVER', 10))
  .map(function(image) {
    var cloudMask = image.select('QA_PIXEL').bitwiseAnd(1 << 3).eq(0);
    return image.updateMask(cloudMask)
                .select(['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7'])
                .divide(10000)
                .copyProperties(image, ['system:time_start']);
  });

var composite = landsat9.median().clip(districts);

var trainingSamples = composite.addBands(esa).sample({
  region: districts.geometry(),
  scale: 30,
  numPixels: 5000,
  seed: 42,
  geometries: true
});

var classifier = ee.Classifier.smileRandomForest(50).train({
  features: trainingSamples,
  classProperty: 'Map',
  inputProperties: composite.bandNames()
});

var classified = composite.classify(classifier)
  .reproject({crs: 'EPSG:4326', scale: 30});

var landcoverVis = {
  min: 10,
  max: 100,
  palette: [
    '006400', 'ffbb22', 'ffff4c', 'f096ff', 'fa0000', 
    'b4b4b4', 'f0f0f0', '0032c8', '0096a0', '00cf75', 'fae6a0'
  ]
};
Map.addLayer(classified, landcoverVis, 'Landcover Classification 2023');

// 饼图
var landcoverClasses = [
  {value: 10, name: 'Forest'},
  {value: 20, name: 'Shrubland'},
  {value: 30, name: 'Grassland'},
  {value: 40, name: 'Cropland'},
  {value: 50, name: 'Built-up'},
  {value: 60, name: 'Bare/Sparse'},
  {value: 70, name: 'Snow/Ice'},
  {value: 80, name: 'Water'},
  {value: 90, name: 'Herbaceous Wetland'},
  {value: 95, name: 'Mangroves'},
  {value: 100, name: 'Moss/Lichen'}
];

var landcoverArea = classified.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: districts.geometry(),
  scale: 30,
  maxPixels: 1e13
});
var hist = ee.Dictionary(landcoverArea.get('classification'));

var pieChartData = landcoverClasses.map(function(c) {
  var key = ee.String(ee.Number(c.value).format());
  var count = ee.Number(ee.Algorithms.If(hist.contains(key), hist.get(key), 0));
  return [c.name, count];
});

var landcoverPieChart = ui.Chart.array.values({
  array: ee.Array(pieChartData.map(function(d) { return [d[1]]; })),
  axis: 0,
  xLabels: pieChartData.map(function(d) { return d[0]; })
})
.setChartType('PieChart')
.setOptions({
  title: 'LandCover Type Distribution',
  titleTextStyle: {fontSize: 14, bold: true},
  sliceVisibilityThreshold: 0,
  pieSliceText: 'percentage',
  legend: {position: 'right', textStyle: {fontSize: 12}},
  chartArea: {width: '70%', height: '70%'},
  fontSize: 13
});

// 饼图panel
var landcoverPanel = ui.Panel({
  widgets: [
    ui.Label('Land Cover Proportion', {
      fontWeight: 'bold',
      fontSize: '14px',
      margin: '0 0 6px 0',
      backgroundColor: 'rgba(0,0,0,0)'
    }),
    landcoverPieChart
  ],
  style: {
    position: 'top-left',
    width: '340px',
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.9)',
    border: '1px solid #ccc',
    borderRadius: '10px'
  }
});
Map.add(landcoverPanel);